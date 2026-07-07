import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Finance, Membership, Perm, Profile, Program } from '../lib/types';
import { setLanguage } from '../i18n';

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
    setMemberships((mems ?? []) as Membership[]);
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
    const { data } = await supabase
      .from('v_program_finance')
      .select('*')
      .eq('program_id', currentProgramId)
      .maybeSingle();
    setFinance((data as Finance) ?? null);
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
