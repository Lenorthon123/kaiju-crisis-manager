import { useRef, useState, type ReactNode } from 'react';
import type { DistrictCode, DistrictView } from '../types/api';
import { SEVERITY_COLORS } from '../lib/format';
import {
  DISTRICT_FULL_NAMES,
  TOKYORK_BAY,
  TOKYORK_DISTRICTS,
  TOKYORK_HINTERLAND,
  TOKYORK_VIEWBOX,
} from '../lib/tokyork-map';

const ALL: DistrictCode[] = ['A', 'E', 'W', 'X', 'Z'];

// The shadow falls down-right, so a quarter only darkens neighbours painted
// BEFORE it. North-west last = every border gets its edge.
// Whatever is hovered goes on top so its outline is never clipped.
function paintOrder(focus: DistrictCode | null | undefined): DistrictCode[] {
  const depth = (code: DistrictCode) => {
    const [x, y] = TOKYORK_DISTRICTS[code].label;
    return x + y; // larger = further south-east = painted earlier
  };
  const ordered = [...ALL].sort((a, b) => depth(b) - depth(a));
  if (!focus) return ordered;
  return [...ordered.filter((c) => c !== focus), focus];
}

interface Props {
  districts: DistrictView[];
  selected?: DistrictCode | null;
  highlighted?: DistrictCode[];
  onSelect?: (code: DistrictCode) => void;
  disabled?: DistrictCode[];
  tooltip?: (district: DistrictView) => ReactNode;
  showLegend?: boolean;
  hint?: string;
}

// A control, not a picture: each quarter is hoverable, focusable and clickable,
// and the tooltip is filled by whichever dashboard is showing it.
export function CityMap({
  districts,
  selected,
  highlighted = [],
  onSelect,
  disabled = [],
  tooltip,
  showLegend = true,
  hint,
}: Props) {
  const byCode = new Map(districts.map((d) => [d.code, d]));
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<DistrictCode | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  const isDisabled = (code: DistrictCode) => disabled.includes(code);
  const canPick = (code: DistrictCode) => Boolean(onSelect) && !isDisabled(code);

  const track = (event: { clientX: number; clientY: number }) => {
    const box = containerRef.current?.getBoundingClientRect();
    if (!box) return;
    setPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
  };

  const hoveredDistrict = hovered ? byCode.get(hovered) : undefined;

  return (
    <div className="w-full">
      <div ref={containerRef} className="relative" onMouseLeave={() => setHovered(null)}>
        <svg
          viewBox={TOKYORK_VIEWBOX}
          className="h-auto w-full"
          role="img"
          aria-label="Map of Tokyork, coloured by quarter severity"
        >
          <defs>
            <filter id="kaiju-cut" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="4" dy="5" stdDeviation="4" floodColor="#000" floodOpacity="0.55" />
            </filter>
            <filter id="kaiju-cut-lift" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="5" dy="7" stdDeviation="7" floodColor="#000" floodOpacity="0.7" />
            </filter>
            <filter id="kaiju-coast" x="-15%" y="-15%" width="130%" height="130%">
              <feDropShadow dx="3" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.45" />
            </filter>
          </defs>

          <path d={TOKYORK_HINTERLAND} fill="#1b2433" />
          <path
            d={TOKYORK_BAY.path}
            fill="#1e3a5f"
            stroke="#0b1120"
            strokeWidth={2}
            filter="url(#kaiju-coast)"
          />
          <text
            x={TOKYORK_BAY.label[0]}
            y={TOKYORK_BAY.label[1]}
            textAnchor="middle"
            className="pointer-events-none select-none fill-sky-300/60 font-semibold"
            style={{ fontSize: 26, letterSpacing: 2 }}
          >
            TOKYORK BAY
          </text>

          {paintOrder(hovered ?? selected ?? null).map((code) => {
            const region = TOKYORK_DISTRICTS[code];
            const district = byCode.get(code);
            const severity = district?.severity ?? 1;
            const isSelected = selected === code;
            const isHovered = hovered === code;
            const isHighlighted = highlighted.includes(code);
            const dimmed = isDisabled(code);

            const stroke = isSelected
              ? '#f8fafc'
              : isHighlighted
                ? '#38bdf8'
                : isHovered
                  ? '#cbd5e1'
                  : '#0b1120';

            return (
              <g
                key={code}
                role={canPick(code) ? 'button' : undefined}
                tabIndex={canPick(code) ? 0 : undefined}
                aria-label={`${DISTRICT_FULL_NAMES[code]} — severity ${severity}`}
                aria-pressed={canPick(code) ? isSelected : undefined}
                aria-disabled={dimmed || undefined}
                className={canPick(code) ? 'cursor-pointer outline-none' : 'outline-none'}
                onMouseEnter={() => setHovered(code)}
                onMouseMove={track}
                onFocus={() => setHovered(code)}
                onBlur={() => setHovered(null)}
                onClick={() => canPick(code) && onSelect?.(code)}
                onKeyDown={(e) => {
                  if (canPick(code) && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect?.(code);
                  }
                }}
              >
                <path
                  d={region.path}
                  fill={SEVERITY_COLORS[severity]}
                  fillOpacity={dimmed ? 0.25 : isSelected || isHovered ? 1 : 0.82}
                  stroke={stroke}
                  strokeWidth={isSelected ? 7 : isHighlighted ? 6 : isHovered ? 5 : 2.5}
                  strokeLinejoin="round"
                  filter={
                    dimmed
                      ? undefined
                      : isSelected || isHovered
                        ? 'url(#kaiju-cut-lift)'
                        : 'url(#kaiju-cut)'
                  }
                  className="transition-[fill,fill-opacity,stroke,stroke-width] duration-500"
                />
                <text
                  x={region.label[0]}
                  y={region.label[1]}
                  textAnchor="middle"
                  className="pointer-events-none select-none font-bold"
                  fill="#0b1120"
                  fillOpacity={dimmed ? 0.4 : 1}
                  style={{ fontSize: 58 }}
                >
                  {code}
                </text>
                <text
                  x={region.label[0]}
                  y={region.label[1] + 30}
                  textAnchor="middle"
                  className="pointer-events-none select-none font-semibold"
                  fill="#0b1120"
                  fillOpacity={dimmed ? 0.3 : 0.75}
                  style={{ fontSize: 22, letterSpacing: 1.5 }}
                >
                  {DISTRICT_FULL_NAMES[code].toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>

        {hoveredDistrict && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-20 w-56 rounded-md border border-white/15
                       bg-ink-900/95 p-2.5 text-xs shadow-xl backdrop-blur"
            style={{
              left: Math.min(Math.max(pointer.x + 14, 4), (containerRef.current?.clientWidth ?? 0) - 230),
              top: Math.max(pointer.y - 8, 4),
            }}
          >
            <p className="flex items-center gap-2 font-semibold text-slate-100">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: SEVERITY_COLORS[hoveredDistrict.severity] }}
              />
              {hoveredDistrict.code} · {DISTRICT_FULL_NAMES[hoveredDistrict.code]}
            </p>
            <p className="mt-1 text-slate-400">
              Severity {hoveredDistrict.severity}
              {hoveredDistrict.isHub && ' · central hub'}
              {hoveredDistrict.hasSeaAccess ? ' · sea access' : ' · landlocked'}
            </p>
            <p className="mt-0.5 text-slate-400">
              Borders {hoveredDistrict.adjacentTo.join(', ') || 'nothing'}
            </p>
            {tooltip && <div className="mt-1.5 border-t border-white/10 pt-1.5">{tooltip(hoveredDistrict)}</div>}
          </div>
        )}
      </div>

      {showLegend && (
        <div className="mt-3 space-y-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400">
            <span className="font-medium uppercase tracking-wide">Severity</span>
            {[1, 2, 3, 4, 5].map((level) => (
              <span key={level} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: SEVERITY_COLORS[level] }}
                />
                {level}
              </span>
            ))}
            <span className="ml-auto text-slate-500">Apex and Warden are landlocked</span>
          </div>
          {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
        </div>
      )}
    </div>
  );
}
