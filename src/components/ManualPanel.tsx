import { CornerDownLeft, Play, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

interface ManualPanelProps {
  onInsert: (code: string) => void;
  onRun: (code: string) => void;
}

type ManualCategory = 'all' | 'workflow' | 'toolkit' | 'packages' | 'shell';

interface ManualSnippet {
  label?: string;
  code: string;
}

interface ManualItem {
  title: string;
  syntax?: string;
  description: string;
}

interface ManualSection {
  id: string;
  category: Exclude<ManualCategory, 'all'>;
  title: string;
  subtitle: string;
  paragraphs: string[];
  items?: ManualItem[];
  snippet?: ManualSnippet;
}

const CATEGORIES: Array<{ id: ManualCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'workflow', label: 'Basics' },
  { id: 'toolkit', label: 'Toolkit' },
  { id: 'packages', label: 'Packages' },
  { id: 'shell', label: 'Shell & Files' },
];

const MANUAL_SECTIONS: ManualSection[] = [
  {
    id: 'quickstart',
    category: 'workflow',
    title: 'Workbench Overview & Quick Start',
    subtitle: 'Browser GAP 4.17 WebAssembly terminal paired with live inspection tools',
    paragraphs: [
      'The terminal runs GAP 4.17 compiled to WebAssembly inside an isolated browser worker backed by a virtual POSIX filesystem in /home/web_user. Preinstalled starter files include semigroups_toolkit.g and semigroup_lab.g.',
      'Use Run in GAP from the Examples or Manual tabs to paste and execute commands directly at the prompt, or use Paste when you want to edit parameters before pressing Enter.',
    ],
    items: [
      {
        title: 'Egg-Box Visualizer',
        description:
          'Automatically refreshes whenever InspectSemigroup(...) writes semigroup_inspect.json, displaying D-classes, group H-classes (*n), Cayley tables (order <= 24), and conjugacy statistics.',
      },
      {
        title: 'Editor & Files',
        description:
          'Edit .g scripts directly in the browser, upload local files into /home/web_user, or download generated JSON and script artifacts.',
      },
      {
        title: 'Headers & Restart GAP',
        description:
          'If SharedArrayBuffer PTY stalls or GAP enters an unresponsive state, open Headers to verify cross-origin isolation or click Restart GAP in the top bar.',
      },
    ],
    snippet: {
      label: 'Run the preinstalled starter script',
      code: 'Read("semigroup_lab.g");',
    },
  },
  {
    id: 'gap-syntax',
    category: 'workflow',
    title: 'GAP Syntax, Help & Error Recovery',
    subtitle: 'Essential REPL conventions at the gap> prompt',
    paragraphs: [
      'Terminate every GAP statement with a semicolon (;) to print its value, or double semicolons (;;) to suppress printing large objects such as full transformation monoids.',
      'Use Read("file.g"); to execute saved scripts cleanly in one step. Inside the interactive terminal, ?Topic opens GAP built-in documentation (press q to exit the pager).',
    ],
    items: [
      {
        title: 'Statement assignment',
        syntax: 'S := FullTransformationMonoid(3);;',
        description: 'Assigns S without flooding the terminal with element listings.',
      },
      {
        title: 'Recovering from break loops',
        syntax: 'quit;',
        description:
          'When an error drops GAP into the brk> prompt, enter quit; (or send Ctrl+D) to return to the standard gap> prompt.',
      },
      {
        title: 'Interrupting long computations',
        syntax: 'Ctrl+C',
        description:
          'Available on keyboard or via the mobile Touch Key Bar below the terminal.',
      },
    ],
    snippet: {
      label: 'Check order and Green’s D-classes of T_3',
      code: [
        'T3 := FullTransformationMonoid(3);;',
        'Print("Order = ", Size(T3), ", D-classes = ", Length(GreensDClasses(T3)), "\\n");',
      ].join('\n'),
    },
  },
  {
    id: 'eggbox-inspect',
    category: 'toolkit',
    title: 'Egg-Box Inspection & Structural Summary',
    subtitle: 'Exporting Green’s relations from GAP to the visualizer',
    paragraphs: [
      'Load semigroups_toolkit.g once per GAP session to unlock SemigroupSummary, InspectSemigroup, pure-GAP semigroup property methods, and research constructors.',
      'In both DisplayEggBoxesOfSemigroup and the Egg-Box tab, an asterisk (*n) marks an H-class containing an idempotent (a maximal subgroup of order n inside that D-class).',
    ],
    items: [
      {
        title: 'InspectSemigroup',
        syntax: 'InspectSemigroup(S[, label[, filename]])',
        description:
          'Computes Green’s D/R/L/H classes, property flags, conjugacy stats (|S| <= 48), inner translation cycles, complete mapping checks, and Cayley table (|S| <= 24), writing semigroup_inspect.json.',
      },
      {
        title: 'SemigroupSummary',
        syntax: 'SemigroupSummary(S)',
        description:
          'Prints a compact terminal table of order, generator count, idempotents, class counts, and structural flags (regular, inverse, band, Clifford, orthodox).',
      },
      {
        title: 'DisplayEggBoxesOfSemigroup',
        syntax: 'DisplayEggBoxesOfSemigroup(S)',
        description:
          'Prints ASCII egg-box matrices for each D-class directly in the terminal, supporting transformation, partial perm, and Rees 0-matrix semigroups.',
      },
    ],
    snippet: {
      label: 'Inspect Symmetric Inverse Monoid I_3',
      code: [
        'Read("semigroups_toolkit.g");;',
        'I3 := SymmetricInverseMonoid(3);;',
        'SemigroupSummary(I3);',
        'InspectSemigroup(I3, "Symmetric Inverse Monoid I_3");',
      ].join('\n'),
    },
  },
  {
    id: 'toolkit-constructors',
    category: 'toolkit',
    title: 'Semigroup & Diagram Monoid Constructors',
    subtitle: 'Pure-GAP families ready inside semigroups_toolkit.g',
    paragraphs: [
      'Beyond built-in GAP constructors such as FullTransformationMonoid(n), SymmetricInverseMonoid(n), and ReesZeroMatrixSemigroup(G, P), the toolkit provides finite band, transformation, and diagram monoid families.',
    ],
    items: [
      {
        title: 'Transformation & Band Families',
        syntax: 'SingularTransformationSemigroup(n), OrderPreservingTransformationSemigroup(n), RectangularBand(m, n), ZeroSemigroup(n), LeftZeroSemigroup(n), RightZeroSemigroup(n), BrandtSemigroup(G, n)',
        description:
          'Finite multiplication-table families are realized via faithful right-regular Cayley transformations so Green’s relations and property checks work seamlessly.',
      },
      {
        title: 'Diagram Monoids',
        syntax: 'PartitionMonoid(n) [n<=3], BrauerMonoid(n) [n<=4], TemperleyLiebMonoid(n) [n<=4]',
        description:
          'Pure-GAP set-partition diagram monoids (e.g. |P_2| = 15, |B_3| = 15, |TL_3| = 5).',
      },
      {
        title: 'Partition-Stabilizing Subsemigroups',
        syntax: 'PartitionStabilizingSemigroup(n, P), PartitionFixingSemigroup(n, P), PartitionPreservingPermutations(n, P)',
        description:
          'Constructs T(X, P), S(X, P), and the permutation group G(X, P) preserving equivalence classes of partition P.',
      },
    ],
    snippet: {
      label: 'Compare diagram monoid sizes',
      code: [
        'Read("semigroups_toolkit.g");;',
        'B3 := BrauerMonoid(3);;',
        'TL3 := TemperleyLiebMonoid(3);;',
        'Print("|B_3|=", Size(B3), ", |TL_3|=", Size(TL3), "\\n");',
        'InspectSemigroup(TL3, "Temperley-Lieb TL_3");',
      ].join('\n'),
    },
  },
  {
    id: 'toolkit-research',
    category: 'toolkit',
    title: 'Conjugacy, Transversals, Complete Mappings & Translations',
    subtitle: 'Specialized finite semigroup analysis routines',
    paragraphs: [
      'semigroups_toolkit.g implements routines for primary and Otto semigroup conjugacy, complete mapping bijections, group transversal properties (k-ut / k-et), and functional digraphs of inner translations.',
    ],
    items: [
      {
        title: 'Semigroup Conjugacy',
        syntax: 'ConjugacyGrowthProfile(S) / SemigroupConjugacyStats(S)',
        description:
          'Computes ~_p* (transitive closure of xy ~ yx), ~_o (Otto conjugacy), and unit conjugacy ~_c for monoids (|S| <= 80).',
      },
      {
        title: 'Complete Mappings',
        syntax: 'CompleteMappingSearch(S) / IsCompleteMapping(S, perm)',
        description:
          'Detects zero obstructions automatically and backtracks for bijections alpha where x -> x*alpha(x) is bijective (|S| <= 9).',
      },
      {
        title: 'Transversal Regularity (k-et / k-ut)',
        syntax: 'HasKUT(G, n, k), HasKET(G, n, k), TransversalRegularityTest(G, n, k)',
        description:
          'Accepts any finite group G (automatically converts non-permutation groups to permutation representations on [1..n]).',
      },
      {
        title: 'Inner Translation Digraphs',
        syntax: 'InnerTranslationDigraphSummary(S), LeftInnerTranslation(S, a), RightInnerTranslation(S, a)',
        description:
          'Summarizes distinct left/right translations and directed cycle lengths of x -> ax and x -> xa.',
      },
    ],
    snippet: {
      label: 'Run conjugacy profile on Brauer B_2',
      code: [
        'Read("semigroups_toolkit.g");;',
        'B2 := BrauerMonoid(2);;',
        'ConjugacyGrowthProfile(B2);',
      ].join('\n'),
    },
  },
  {
    id: 'packages-info',
    category: 'packages',
    title: 'Bundled GAP Packages & Semigroups Support',
    subtitle: 'What is included in WebAssembly and how pure-GAP fallbacks fill the gap',
    paragraphs: [
      'This WebAssembly build includes GAP 4.17 core along with standard packages such as smallsemi, numericalsgps, automata, ctbllib, smallgrp, polycyclic, fga, and sonata.',
      'The external Semigroups GAP package itself is NOT compiled into this WebAssembly bundle (along with digraphs, datastructures, and orb), so LoadPackage("semigroups") returns fail. Instead, semigroups_toolkit.g installs pure-GAP methods on top of GAP core’s native semigroup engine for IsBand, IsSemilattice, IsCommutativeSemigroup, IsOrthodoxSemigroup, IsCompletelyRegularSemigroup, IsCliffordSemigroup, IsIdempotentGenerated, IsGroupAsSemigroup, and DisplayEggBoxesOfSemigroup.',
    ],
    items: [
      {
        title: 'Smallsemi in WebAssembly',
        syntax: 'Filtered(AllSmallSemigroups(4), IsInverseSemigroup);',
        description:
          'Prefer GAP’s Filtered(...) over multi-argument AllSmallSemigroups(n, prop, true), which triggers loading large order-8 metadata tables in 32-bit WebAssembly.',
      },
      {
        title: 'NumericalSgps & Automata',
        syntax: 'LoadPackage("numericalsgps");; / LoadPackage("automata");;',
        description:
          'Both packages work natively. Wrap TransitionSemigroup(A) with InspectSemigroup(...) after reading semigroups_toolkit.g to render its Egg-Box diagram.',
      },
    ],
    snippet: {
      label: 'Query Smallsemi inverse semigroups of order 4',
      code: [
        'LoadPackage("smallsemi");;',
        'inv := Filtered(AllSmallSemigroups(4), IsInverseSemigroup);;',
        'Print("Count: ", Length(inv), ", IDs: ", List(inv, IdSmallSemigroup), "\\n");',
      ].join('\n'),
    },
  },
  {
    id: 'linux-shell',
    category: 'shell',
    title: 'Built-In Linux Shell & Virtual Filesystem',
    subtitle: 'Inspecting, uploading, and resetting /home/web_user files',
    paragraphs: [
      'Click Linux Shell above the terminal (or run QuitGap(0);) to switch to a lightweight POSIX shell operating directly inside /home/web_user. Type gap (or click Launch GAP) to restart GAP 4.17.',
      'Uploaded files and Editor saves sync immediately into the running GAP worker so Read("your_script.g"); works without restarting.',
    ],
    items: [
      {
        title: 'Shell commands',
        syntax: 'ls [-l], cat, head, tail, wc, grep, touch, cp, mv, rm, echo "..." > file, pwd, whoami, uname [-a], df, clear, semigroups, gap [script.g], help',
        description:
          'Standard file inspection and cleanup utilities inside the browser virtual filesystem.',
      },
      {
        title: 'Touch Key Bar & Mobile View',
        description:
          'On phones or tablets, toggle the keyboard button above the terminal to show quick keys (Tab, arrows, :=, ;;, Ctrl+C, Ctrl+D), and switch between Terminal and workbench tabs below the top bar.',
      },
      {
        title: 'Resetting Cache',
        description:
          'If GAP assets fail to load after an app update, use Reset Cache in the Files tab to clear cached GAP files and reboot cleanly.',
      },
    ],
  },
];

export function ManualPanel({ onInsert, onRun }: ManualPanelProps) {
  const [category, setCategory] = useState<ManualCategory>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MANUAL_SECTIONS.filter((section) => {
      if (category !== 'all' && section.category !== category) return false;
      if (!q) return true;
      if (
        section.title.toLowerCase().includes(q) ||
        section.subtitle.toLowerCase().includes(q) ||
        section.paragraphs.some((p) => p.toLowerCase().includes(q)) ||
        (section.snippet && section.snippet.code.toLowerCase().includes(q))
      ) {
        return true;
      }
      return (
        section.items?.some(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            (item.syntax && item.syntax.toLowerCase().includes(q))
        ) ?? false
      );
    });
  }, [category, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 space-y-2.5 border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search manual, functions, packages, or shell commands…"
            className="w-full min-h-[38px] rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none dark:border-slate-700 dark:bg-[#0B0E14] dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 workbench-scroll">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`min-h-[32px] px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                category === cat.id
                  ? 'bg-slate-900 text-white dark:bg-cyan-500 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800 workbench-scroll">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            No manual sections match "{query}".
          </div>
        ) : (
          filtered.map((section) => (
            <section key={section.id} className="p-4 space-y-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                  {CATEGORIES.find((c) => c.id === section.category)?.label ?? section.category}
                </div>
                <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {section.title}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {section.subtitle}
                </p>
              </div>

              <div className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {section.paragraphs.map((p, idx) => (
                  <p key={idx}>{p}</p>
                ))}
              </div>

              {section.items && section.items.length > 0 && (
                <dl className="space-y-2.5 rounded-md border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-[#0B0E14]/70">
                  {section.items.map((item) => (
                    <div key={item.title} className="space-y-0.5">
                      <dt className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.title}
                      </dt>
                      {item.syntax && (
                        <div className="font-mono text-[11px] leading-snug text-cyan-700 dark:text-cyan-300 break-words">
                          {item.syntax}
                        </div>
                      )}
                      <dd className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {item.description}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {section.snippet && (
                <div className="space-y-2 pt-0.5">
                  {section.snippet.label && (
                    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {section.snippet.label}
                    </div>
                  )}
                  <pre className="overflow-x-auto rounded border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-[#0B0E14] dark:text-slate-300 workbench-scroll">
                    {section.snippet.code}
                  </pre>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRun(section.snippet!.code)}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Play className="h-3 w-3" aria-hidden="true" />
                      Run in GAP
                    </button>
                    <button
                      type="button"
                      onClick={() => onInsert(section.snippet!.code)}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
                      Paste
                    </button>
                  </div>
                </div>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
