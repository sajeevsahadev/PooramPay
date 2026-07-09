import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase, fmtDate } from '../lib/supabase';
import { useApp } from '../state/AppContext';
import { Field, ErrorNote, friendlyError, Modal } from '../components/ui';
import { displayName, type CommitteeTask, type Membership } from '../lib/types';

const COLS: { id: CommitteeTask['status']; key: string; cls: string }[] = [
  { id: 'pending', key: 'tasks.pending', cls: 'border-amber-300' },
  { id: 'in_progress', key: 'tasks.inProgress', cls: 'border-blue-300' },
  { id: 'done', key: 'tasks.doneCol', cls: 'border-green-300' },
];

export default function Tasks() {
  const { t, i18n } = useTranslation();
  const { currentProgramId, session, can, frozen } = useApp();
  const [tasks, setTasks] = useState<CommitteeTask[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', desc: '', assignee: '', due: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!currentProgramId) return;
    const [tk, mem] = await Promise.all([
      supabase.from('committee_tasks').select('*').eq('program_id', currentProgramId)
        .order('created_at', { ascending: false }),
      supabase.from('program_members').select('*, profiles(nickname, full_name)').eq('program_id', currentProgramId),
    ]);
    setTasks((tk.data ?? []) as CommitteeTask[]);
    setMembers((mem.data ?? []) as Membership[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [currentProgramId]);

  const memberName = (id: string | null) => {
    const m = members.find((x) => x.id === id);
    return m ? displayName(m) : '';
  };
  const myMemberIds = members.filter((m) => m.profile_id === session!.user.id).map((m) => m.id);

  const move = async (task: CommitteeTask, dir: 1 | -1) => {
    const order: CommitteeTask['status'][] = ['pending', 'in_progress', 'done'];
    const next = order[order.indexOf(task.status) + dir];
    if (!next) return;
    try {
      await supabase.from('committee_tasks')
        .update({ status: next, updated_at: new Date().toISOString() })
        .eq('id', task.id).throwOnError();
      await load();
    } catch (e) { setErr(friendlyError(e)); }
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setBusy(true); setErr(null);
    try {
      await supabase.from('committee_tasks').insert({
        program_id: currentProgramId,
        title: form.title.trim(),
        description: form.desc || null,
        assignee_member_id: form.assignee || null,
        due_date: form.due || null,
        created_by: session!.user.id,
      }).throwOnError();
      setShowNew(false); setForm({ title: '', desc: '', assignee: '', due: '' });
      await load();
    } catch (e) { setErr(friendlyError(e)); }
    setBusy(false);
  };

  const canMove = (task: CommitteeTask) =>
    !frozen && (can('tasks') || (task.assignee_member_id != null && myMemberIds.includes(task.assignee_member_id)));

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">✅ {t('tasks.title')}</h1>
        {can('tasks') && !frozen && (
          <button className="btn-primary text-sm" onClick={() => setShowNew(true)}>＋ {t('tasks.newTask')}</button>
        )}
      </div>
      <ErrorNote msg={err} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {COLS.map((col) => (
          <div key={col.id} className={`rounded-xl border-t-4 ${col.cls} bg-stone-100/60 p-2 min-h-32`}>
            <div className="font-bold text-sm px-1 py-1.5">
              {t(col.key)} ({tasks.filter((x) => x.status === col.id).length})
            </div>
            <div className="space-y-2">
              {tasks.filter((x) => x.status === col.id).map((task) => {
                const mine = task.assignee_member_id != null && myMemberIds.includes(task.assignee_member_id);
                return (
                  <div key={task.id} className={`card p-3 ${mine ? 'ring-2 ring-brand-600' : ''}`}>
                    <div className="font-semibold text-sm">{task.title}</div>
                    {task.description && <div className="text-xs text-stone-500 mt-0.5">{task.description}</div>}
                    <div className="flex justify-between items-center mt-2 text-xs text-stone-500">
                      <span>
                        {task.assignee_member_id && <>👤 {memberName(task.assignee_member_id)}</>}
                        {task.due_date && <> · 📅 {fmtDate(task.due_date, i18n.language)}</>}
                      </span>
                      {canMove(task) && (
                        <span className="flex gap-1">
                          {task.status !== 'pending' && (
                            <button className="px-2 py-0.5 rounded bg-stone-200" onClick={() => move(task, -1)}>←</button>
                          )}
                          {task.status !== 'done' && (
                            <button className="px-2 py-0.5 rounded bg-brand-700 text-white" onClick={() => move(task, 1)}>→</button>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <Modal title={t('tasks.newTask')} onClose={() => setShowNew(false)}>
          <Field label={t('tasks.taskTitle')}>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label={`${t('common.notes')} (${t('common.optional')})`}>
            <input value={form.desc} onChange={(e) => setForm({ ...form, desc: e.target.value })} />
          </Field>
          <Field label={t('tasks.assignTo')}>
            <select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
              <option value="">—</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{displayName(m)}</option>
              ))}
            </select>
          </Field>
          <Field label={t('tasks.dueDate')}>
            <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </Field>
          <button className="btn-primary w-full" disabled={busy || !form.title.trim()} onClick={save}>
            {t('common.save')}
          </button>
        </Modal>
      )}
    </div>
  );
}
