import { Grid3X3, Play } from 'lucide-react';
import { useState } from 'react';
import type { EggBoxCell, GreensDClassInfo, SemigroupInspection } from '../types/gap';

interface EggBoxPanelProps {
  inspection: SemigroupInspection | null;
  onRunSnippet: (code: string) => void;
}

const PRESET_INSPECTIONS = [
  {
    label: 'Inspect T_3',
    code: 'Read("semigroups_toolkit.g");;\nInspectSemigroup(FullTransformationMonoid(3), "Full Transformation Monoid T_3");',
  },
  {
    label: 'Inspect B_3',
    code: 'Read("semigroups_toolkit.g");;\nInspectSemigroup(BrauerMonoid(3), "Brauer Monoid B_3");',
  },
  {
    label: 'Inspect T(4, P)',
    code: 'Read("semigroups_toolkit.g");;\nInspectSemigroup(PartitionStabilizingSemigroup(4, [[1,2],[3,4]]), "Partition-Stabilizing T(4, P)");',
  },
  {
    label: 'Inspect O_3',
    code: 'Read("semigroups_toolkit.g");;\nInspectSemigroup(OrderPreservingTransformationSemigroup(3), "Order-Preserving O_3");',
  },
];

interface SelectedCell {
  dClassIndex: number;
  rIdx: number;
  lIdx: number;
  regularD: boolean;
  cell: EggBoxCell;
}

export function EggBoxPanel({ inspection, onRunSnippet }: EggBoxPanelProps) {
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [hoverRC, setHoverRC] = useState<{ r: number; c: number } | null>(null);

  if (!inspection) {
    return (
      <div className="flex h-full flex-col justify-between p-4 lg:p-5 overflow-y-auto workbench-scroll">
        <div>
          <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
            <Grid3X3 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
            <h2 className="font-display text-sm font-semibold">
              Green&apos;s Relations &amp; Egg-Box Explorer
            </h2>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Run <code className="font-mono text-cyan-700 dark:text-cyan-300">InspectSemigroup(S);</code> in GAP WebAssembly to compute Green&apos;s D, R, L, H-classes, conjugacy classes, inner translation cycles, complete mappings, and the Cayley multiplication table.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-2">
            {PRESET_INSPECTIONS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onRunSnippet(preset.code)}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 hover:border-cyan-500/50 hover:bg-cyan-500/5 dark:border-slate-800 dark:bg-[#131926] dark:text-slate-200 dark:hover:border-cyan-500/50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Play className="h-3 w-3 text-cyan-600 dark:text-cyan-400 shrink-0" aria-hidden="true" />
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Custom GAP Usage
          </h3>
          <pre className="mt-2 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-[#0B0E14] dark:text-slate-300">
{`Read("semigroups_toolkit.g");;
S := PartitionStabilizingSemigroup(4, [[1,2],[3,4]]);;
InspectSemigroup(S, "T(4, P)");`}
          </pre>
        </div>
      </div>
    );
  }

  const propEntries: Array<{ key: string; label: string; value: boolean }> = [
    { key: 'regular', label: 'Regular', value: inspection.properties.regular },
    { key: 'inverse', label: 'Inverse', value: inspection.properties.inverse },
    { key: 'band', label: 'Band', value: inspection.properties.band },
    { key: 'semilattice', label: 'Semilattice', value: inspection.properties.semilattice },
    { key: 'commutative', label: 'Commutative', value: inspection.properties.commutative },
    { key: 'simple', label: 'Simple', value: inspection.properties.simple },
    { key: 'zeroSimple', label: '0-Simple', value: inspection.properties.zeroSimple },
    { key: 'clifford', label: 'Clifford', value: inspection.properties.clifford },
    { key: 'orthodox', label: 'Orthodox', value: inspection.properties.orthodox },
    { key: 'monoid', label: 'Monoid', value: inspection.properties.monoid },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 space-y-5 workbench-scroll">
      {/* Header & Quick Re-Inspect Triggers */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {inspection.label}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              |S| = {inspection.order} · {inspection.dClasses.length} D-classes · {inspection.idempotentCount} idempotents
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {PRESET_INSPECTIONS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onRunSnippet(preset.code)}
              className="min-h-[32px] rounded border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Numeric Summary Grid */}
      <div className="grid grid-cols-4 border-y border-slate-200 py-3 dark:border-slate-800">
        <div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Order</div>
          <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {inspection.order}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Idempotents</div>
          <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {inspection.idempotentCount}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">R / L</div>
          <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {inspection.rClassCount}/{inspection.lClassCount}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">H-Classes</div>
          <div className="mt-0.5 font-mono text-base font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {inspection.hClassCount}
          </div>
        </div>
      </div>

      {/* Structural Properties Table */}
      <div>
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          Structural Invariants
        </h3>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          {propEntries.map((p) => (
            <div
              key={p.key}
              className="flex items-center justify-between border-b border-slate-100 py-1 dark:border-slate-800/70"
            >
              <span className="text-slate-600 dark:text-slate-400">{p.label}</span>
              <span
                className={`font-mono font-medium ${
                  p.value
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400 dark:text-slate-600'
                }`}
              >
                {p.value ? '✓ True' : '— False'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Conjugacy, Inner Translations & Complete Mapping */}
      {(inspection.conjugacy || inspection.innerTranslations || inspection.completeMapping) && (
        <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Conjugacy, Inner Translations &amp; Complete Mappings
          </h3>
          <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-slate-50/50 text-xs dark:divide-slate-800/70 dark:border-slate-800 dark:bg-[#0B0E14]/60">
            {inspection.conjugacy && (
              <>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-slate-600 dark:text-slate-400">
                    ~_p* / ~_o / ~_c classes
                  </span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {inspection.conjugacy.primaryClasses} / {inspection.conjugacy.ottoClasses} /{' '}
                    {inspection.conjugacy.unitClasses ?? 'n/a'}
                  </span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-slate-600 dark:text-slate-400">
                    Direct ~_p transitive
                  </span>
                  <span
                    className={`font-mono font-medium ${
                      inspection.conjugacy.primaryTransitive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {inspection.conjugacy.primaryTransitive ? '✓ Yes' : '✖ No'}
                  </span>
                </div>
              </>
            )}

            {inspection.innerTranslations && (
              <>
                <div className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-slate-600 dark:text-slate-400">
                    Distinct λ_a / ρ_a maps
                  </span>
                  <span className="font-mono font-medium text-slate-900 dark:text-slate-100 tabular-nums">
                    {inspection.innerTranslations.leftDistinctCount} /{' '}
                    {inspection.innerTranslations.rightDistinctCount}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="text-slate-600 dark:text-slate-400">
                    Translation cycle lengths
                  </span>
                  <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 tabular-nums text-right">
                    L:[{inspection.innerTranslations.leftCycleLengths.join(',')}] · R:[
                    {inspection.innerTranslations.rightCycleLengths.join(',')}]
                  </span>
                </div>
              </>
            )}

            {inspection.completeMapping && (
              <div className="px-3 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400">Complete mapping</span>
                  <span
                    className={`font-mono font-medium ${
                      inspection.completeMapping.exists === true
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : inspection.completeMapping.exists === false
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {inspection.completeMapping.exists === true
                      ? '✓ Exists'
                      : inspection.completeMapping.exists === false
                      ? '✖ None'
                      : '— Unchecked'}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {inspection.completeMapping.reason}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Egg-Box Diagrams */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Egg-Box D-Class Decomposition
          </h3>
          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
            * = group H-class
          </span>
        </div>

        <div className="mt-2.5 space-y-4">
          {inspection.dClasses.map((dClass: GreensDClassInfo) => (
            <div
              key={dClass.index}
              className="rounded-md border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-[#0B0E14]/70"
            >
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                  D{dClass.index} ({dClass.rCount}×{dClass.lCount})
                </span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    dClass.regular
                      ? 'text-cyan-700 dark:text-cyan-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  |D| = {dClass.size} · {dClass.regular ? 'Regular' : 'Non-regular'}
                </span>
              </div>

              <div className="overflow-x-auto workbench-scroll">
                <table className="border-collapse font-mono text-xs tabular-nums">
                  <tbody>
                    {dClass.eggBox.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, lIdx) => {
                          const isSelected =
                            selectedCell?.dClassIndex === dClass.index &&
                            selectedCell.rIdx === rIdx &&
                            selectedCell.lIdx === lIdx;
                          return (
                            <td key={lIdx} className="p-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedCell({
                                    dClassIndex: dClass.index,
                                    rIdx,
                                    lIdx,
                                    regularD: dClass.regular,
                                    cell,
                                  })
                                }
                                title={`R${rIdx + 1} ∩ L${lIdx + 1} · |H|=${cell.size} · ${cell.rep}`}
                                className={`min-h-[32px] min-w-[36px] px-1.5 rounded border text-center transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-800 dark:text-cyan-200'
                                    : cell.isGroup
                                    ? 'border-cyan-600/30 bg-cyan-500/10 text-cyan-800 dark:border-cyan-400/30 dark:text-cyan-300 hover:border-cyan-500'
                                    : 'border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-[#131926] dark:text-slate-300 hover:border-slate-400 dark:hover:border-slate-600'
                                }`}
                              >
                                {cell.isGroup ? `*${cell.size}` : cell.size}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {selectedCell && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-[#131926]">
            <div className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              D{selectedCell.dClassIndex} · Cell (R{selectedCell.rIdx + 1}, L{selectedCell.lIdx + 1})
            </div>
            <div className="mt-1 space-y-0.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
              <div>H-class size: {selectedCell.cell.size}</div>
              <div>
                Group H-class: {selectedCell.cell.isGroup ? 'Yes (contains idempotent)' : 'No'}
              </div>
              <div className="break-all">Representative: {selectedCell.cell.rep}</div>
            </div>
          </div>
        )}
      </div>

      {/* Cayley Multiplication Table */}
      {inspection.cayleyTable && inspection.elements && (
        <div>
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Cayley Multiplication Table ({inspection.elements.length}×{inspection.elements.length})
          </h3>
          <div className="mt-2 overflow-x-auto rounded-md border border-slate-200 dark:border-slate-800 workbench-scroll">
            <table className="border-collapse font-mono text-[11px] tabular-nums">
              <thead>
                <tr className="bg-slate-100 dark:bg-[#131926]">
                  <th className="border-b border-r border-slate-200 px-2 py-1 text-slate-500 dark:border-slate-800">
                    *
                  </th>
                  {inspection.elements.map((el, idx) => (
                    <th
                      key={idx}
                      title={el}
                      className={`border-b border-slate-200 px-2 py-1 text-center dark:border-slate-800 ${
                        hoverRC?.c === idx
                          ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspection.cayleyTable.map((row, rIdx) => (
                  <tr key={rIdx}>
                    <th
                      title={inspection.elements?.[rIdx]}
                      className={`border-r border-slate-200 px-2 py-1 text-right dark:border-slate-800 ${
                        hoverRC?.r === rIdx
                          ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                          : 'bg-slate-50 text-slate-600 dark:bg-[#131926] dark:text-slate-400'
                      }`}
                    >
                      {rIdx + 1}
                    </th>
                    {row.map((val, cIdx) => (
                      <td
                        key={cIdx}
                        onMouseEnter={() => setHoverRC({ r: rIdx, c: cIdx })}
                        onMouseLeave={() => setHoverRC(null)}
                        title={`${inspection.elements?.[rIdx]} * ${inspection.elements?.[cIdx]} = ${inspection.elements?.[val - 1]}`}
                        className={`px-2 py-1 text-center ${
                          hoverRC?.r === rIdx || hoverRC?.c === cIdx
                            ? 'bg-cyan-500/10 text-slate-900 dark:text-slate-100'
                            : 'text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
