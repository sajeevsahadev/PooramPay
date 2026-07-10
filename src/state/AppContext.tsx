import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Finance, Membership, Perm, Profile, Program } from '../lib/types';
import { setLanguage } from '../i18n';

/** Friendly device string from the user agent, e.g. "Android · Chrome". */
function parseDevice(ua: string): string {
  const os = /android/i.test(ua) ? 'Android'
    : /iphone|ipad|ipod/i.test(ua) ? 'iOS'
    : /windows/i.test(ua) ? 'Windows'
    : /mac os/i.test(ua) ? 'Mac'
    : /linux/i.test(ua) ? 'Linux' : 'Unknown';
  const br = /edg/i.test(ua) ? 'Edge'
    : /opr|opera/i.test(ua) ? 'Opera'
    : /chrome|crios/i.test(ua) ? 'Chrome'
    : /firefox|fxios/i.test(ua) ? 'Firefox'
    : /safari/i.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${br}`;
}

// log a login event once per browser session
let accessLogged = false;
async function logAccess(profileId: string, email: string | null, programId: string | null) {
  if (accessLogged || sessionStorage.getItem('pp-access-logged')) return;
  accessLogged = true;
  sessionStorage.setItem('pp-access-logged', '1');
  let geo: { ip?: string; city?: string; region?: string; country?: string } = {};
  try {
    const r = await fetch('https://ipwho.is/');
    if (r.ok) {
      const d = await r.json();
      if (d?.success !== false) geo = { ip: d.ip, city: d.city, region: d.region, country: d.country };
    }
  } catch { /* geolocation is best-effort */ }
  try {
    await supabase.from('access_log').insert({
      profile_id: profileId,
      email,
      ip: geo.ip ?? null,
      user_agent: navigator.userAgent,
      device: parseDevice(navigator.userAgent),
      city: geo.city ?? null,
      region: geo.region ?? null,
      country: geo.country ?? null,
      program_id: programId,
    });
  } catch { /* never block the app on logging */ }
}

interface AppState {
  session: Session | null;
  profile: Profile | null;
  memberships: Membership[];
  /** Every program the user can open: own memberships, plus ALL programs for platform admins. */
  programOptions: Program[];
  currentProgramId: string | null;
  setCurrentProgramId: (id: string) => void;
  current: Membership | null;
  currentProgram: Program | null;
  finance: Finance | null;
  loading: boolean;
  isPadmin: boolean;
  frozen: boolean;
  can: (perm: Perm) => boolean;
  isCommitteeAdmin: boolean;
  refresh: () => Promise<void>;
  refreshFinance: () => Promise<void>;
}

const Ctx = createContext<AppState>(null as unknown as AppState);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [allPrograms, setAllPrograms] = useState<Program[]>([]);
  const [currentProgramId, setPid] = useState<string | null>(
    localStorage.getItem('pp-program'),
  );
  const [finance, setFinance] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    if (!session) return;
    const [{ data: prof }, { data: mems }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      supabase
        .from('program_members')
        .select('*, programs(*, committees(*, organizations(*)))')
        .eq('profile_id', session.user.id),
    ]);
    setProfile(prof as Profile);
    if (prof?.language) setLanguage(prof.language);
    const memList = (mems ?? []) as Membership[];
    setMemberships(memList);
    if (prof) logAccess((prof as Profile).id, (prof as Profile).email, memList[0]?.program_id ?? null);
    if ((prof as Profile | null)?.is_platform_admin) {
      // superadmin oversight: every program on the platform is selectable
      const { data: progs } = await supabase
        .from('programs')
        .select('*, committees(*, organizations(*))')
        .order('year', { ascending: false });
      setAllPrograms((progs ?? []) as Program[]);
    }
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  const programOptions = useMemo(() => {
    const map = new Map<string, Program>();
    for (const m of memberships) if (m.programs) map.set(m.program_id, m.programs);
    for (const p of allPrograms) map.set(p.id, p);
    return [...map.values()];
  }, [memberships, allPrograms]);

  // keep the selected program valid once options are known
  useEffect(() => {
    if (loading || programOptions.length === 0) return;
    setPid((prev) => {
      if (prev && programOptions.some((p) => p.id === prev)) return prev;
      const first = memberships[0]?.program_id ?? programOptions[0]?.id ?? null;
      if (first) localStorage.setItem('pp-program', first);
      return first;
    });
  }, [loading, programOptions, memberships]);

  const current = useMemo(
    () => memberships.find((m) => m.program_id === currentProgramId) ?? null,
    [memberships, currentProgramId],
  );
  const currentProgram = useMemo(
    () => programOptions.find((p) => p.id === currentProgramId) ?? current?.programs ?? null,
    [programOptions, currentProgramId, current],
  );

  const refreshFinance = useCallback(async () => {
    if (!currentProgramId) return setFinance(null);
    // program-scoped function (indexed) instead of the global-aggregate view
    const { data } = await supabase.rpc('program_finance', { p_program: currentProgramId });
    setFinance(((data as Finance[] | null)?.[0]) ?? null);
  }, [currentProgramId]);

  useEffect(() => {
    refreshFinance();
  }, [refreshFinance]);

  const setCurrentProgramId = (id: string) => {
    localStorage.setItem('pp-program', id);
    setPid(id);
  };

  const isPadmin = !!profile?.is_platform_admin;
  const frozen = currentProgram?.status === 'frozen';
  const isCommitteeAdmin = current?.role === 'committee_admin' || isPadmin;
  const can = (perm: Perm) =>
    isPadmin || current?.role === 'committee_admin' || !!current?.permissions?.[perm];

  return (
    <Ctx.Provider
      value={{
        session, profile, memberships, programOptions, currentProgramId, setCurrentProgramId,
        current, currentProgram, finance, loading, isPadmin, frozen, can, isCommitteeAdmin,
        refresh, refreshFinance,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
