import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../services/api';
import { useToast } from './Toast';
import clsx from 'clsx';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isToday } from 'date-fns';
import { sr } from 'date-fns/locale';

type AvailStatus = 'free' | 'busy' | 'vacation';

interface DayEntry {
  date: string;
  status: AvailStatus;
  note?: string;
}

const STATUS_CONFIG: Record<AvailStatus, { label: string; color: string; bg: string }> = {
  free: { label: 'Slobodan', color: 'text-green-700', bg: 'bg-green-100 hover:bg-green-200' },
  busy: { label: 'Zauzet', color: 'text-red-700', bg: 'bg-red-100 hover:bg-red-200' },
  vacation: { label: 'Godišnji', color: 'text-blue-700', bg: 'bg-blue-100 hover:bg-blue-200' },
};

const STATUS_CYCLE: AvailStatus[] = ['free', 'busy', 'vacation'];

interface AvailabilityCalendarProps {
  userId: string;
  editable?: boolean;
  compact?: boolean;
}

export function AvailabilityCalendar({ userId, editable, compact }: AvailabilityCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [entries, setEntries] = useState<Record<string, AvailStatus>>({});
  const toast = useToast();

  const monthKey = format(currentMonth, 'yyyy-MM');

  useEffect(() => {
    api.get<DayEntry[]>(`/forum/availability/${userId}?month=${monthKey}`)
      .then(data => {
        const map: Record<string, AvailStatus> = {};
        data.forEach(d => { map[d.date.split('T')[0]] = d.status as AvailStatus; });
        setEntries(map);
      })
      .catch(() => {});
  }, [userId, monthKey]);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const startPad = (getDay(startOfMonth(currentMonth)) + 6) % 7;

  const toggleDay = async (date: Date) => {
    if (!editable) return;
    const key = format(date, 'yyyy-MM-dd');
    const current = entries[key] || 'free';
    const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
    const next = STATUS_CYCLE[nextIdx];
    setEntries(prev => ({ ...prev, [key]: next }));

    try {
      await api.put('/forum/availability', {
        dates: [{ date: key, status: next }],
      });
    } catch {
      toast.show('Greška pri čuvanju', 'error');
    }
  };

  return (
    <div className={clsx('mx-auto w-full', compact ? 'max-w-lg' : 'max-w-xl')}>
      <div className={clsx('flex items-center justify-between', compact ? 'mb-4' : 'mb-4')}>
        <button
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className={clsx('hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg', compact ? 'p-1.5' : 'p-2')}
        >
          <ChevronLeft size={compact ? 18 : 20} />
        </button>
        <h3 className={clsx('font-semibold capitalize', compact ? 'text-base' : 'text-lg')}>
          {format(currentMonth, 'MMMM yyyy', { locale: sr })}
        </h3>
        <button
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className={clsx('hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg', compact ? 'p-1.5' : 'p-2')}
        >
          <ChevronRight size={compact ? 18 : 20} />
        </button>
      </div>

      <div className={clsx('grid grid-cols-7', compact ? 'gap-1.5 mb-2' : 'gap-1 mb-2')}>
        {['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'].map(d => (
          <div key={d} className={clsx('text-center font-medium text-gray-500 py-1', compact ? 'text-xs' : 'text-xs')}>{d}</div>
        ))}
      </div>

      <div className={clsx('grid grid-cols-7', compact ? 'gap-1.5' : 'gap-1')}>
        {Array.from({ length: startPad }).map((_, i) => <div key={`pad-${i}`} />)}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const status = entries[key] || 'free';
          const cfg = STATUS_CONFIG[status];
          return (
            <button
              key={key}
              onClick={() => toggleDay(day)}
              disabled={!editable}
              className={clsx(
                'aspect-square rounded-lg font-medium flex items-center justify-center transition-colors',
                compact ? 'text-base min-h-[2.75rem]' : 'text-sm',
                cfg.bg, cfg.color,
                !isSameMonth(day, currentMonth) && 'opacity-30',
                isToday(day) && 'ring-2 ring-brand-500',
                editable && 'cursor-pointer'
              )}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      <div className={clsx('flex flex-wrap justify-center gap-2', compact ? 'mt-3' : 'mt-4')}>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <span key={key} className={clsx('text-xs px-2.5 py-1 rounded-full', cfg.bg, cfg.color)}>
            {cfg.label}
          </span>
        ))}
      </div>
      {editable && (
        <p className="text-xs text-gray-500 mt-2 text-center">Kliknite na dan da promenite status</p>
      )}
    </div>
  );
}
