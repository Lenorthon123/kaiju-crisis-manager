import type { CatastropheView } from '../types/api';
import { SEVERITY_COLORS } from '../lib/format';

export function LevelBanner({ catastrophe }: { catastrophe: CatastropheView }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-ink-800 px-4 py-3">
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md font-bold text-ink-900"
        style={{ backgroundColor: SEVERITY_COLORS[catastrophe.level] }}
      >
        {catastrophe.level}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-100">
          Catastrophe level {catastrophe.level} — {catastrophe.name}
        </p>
        <p className="truncate text-xs text-slate-400">{catastrophe.description}</p>
      </div>
      <ol className="ml-auto flex items-center gap-1">
        {catastrophe.levels.map((l) => (
          <li
            key={l.level}
            title={`${l.name}: ${l.description}`}
            className={`h-2 w-8 rounded-full ${
              l.level <= catastrophe.level ? '' : 'bg-white/10'
            }`}
            style={
              l.level <= catastrophe.level
                ? { backgroundColor: SEVERITY_COLORS[l.level] }
                : undefined
            }
          />
        ))}
      </ol>
    </div>
  );
}
