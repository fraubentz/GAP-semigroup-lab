import type { GapExample } from '../types/gap';

export const GAP_EXAMPLES: GapExample[] = [
  {
    id: 'bentz-partition-stab',
    title: 'Partition-Stabilizing T(X, P)',
    category: 'bentz',
    summary:
      'Constructs transformations on {1..4} stabilizing P = {{1,2},{3,4}} and inspects its Green’s classes and conjugacy.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'P := [[1, 2], [3, 4]];;',
      'S := PartitionStabilizingSemigroup(4, P);;',
      'SemigroupSummary(S);',
      'InspectSemigroup(S, "Partition-Stabilizing T(4, {{1,2},{3,4}})");',
    ].join('\n'),
  },
  {
    id: 'bentz-conjugacy',
    title: 'Semigroup Conjugacy (~_p*, ~_o, ~_c)',
    category: 'bentz',
    summary:
      'Compares primary conjugacy transitive closure, Otto conjugacy, and unit conjugacy on T_3 and checks transitivity of ~_p.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'T3 := FullTransformationMonoid(3);;',
      'ConjugacyGrowthProfile(T3);',
      'InspectSemigroup(T3, "T_3 Conjugacy & Egg-Box");',
    ].join('\n'),
  },
  {
    id: 'bentz-complete-mappings',
    title: 'Complete Mappings of Finite Semigroups',
    category: 'bentz',
    summary:
      'Searches for bijections alpha with x -> x*alpha(x) bijective across C_5, S_3, LeftZero(4), and ZeroSemigroup(4).',
    code: [
      'Read("semigroups_toolkit.g");;',
      'Print("C_5: ", CompleteMappingSearch(CyclicGroup(5)), "\\n");',
      'Print("C_4: ", CompleteMappingSearch(CyclicGroup(4)), "\\n");',
      'Print("S_3: ", CompleteMappingSearch(SymmetricGroup(3)), "\\n");',
      'Print("L_4: ", CompleteMappingSearch(LeftZeroSemigroup(4)), "\\n");',
      'Print("Z_4: ", CompleteMappingSearch(ZeroSemigroup(4)), "\\n");',
    ].join('\n'),
  },
  {
    id: 'bentz-transversal-ket',
    title: 'Transversal Properties (k-et & k-ut)',
    category: 'bentz',
    summary:
      'Tests A_4 and C_4 on 4 points for the 2-universal and 2-existential transversal properties and verifies regularity of <G, t>.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'TransversalRegularityTest(AlternatingGroup(4), 4, 2);',
      'TransversalRegularityTest(CyclicGroup(IsPermGroup, 4), 4, 2);',
    ].join('\n'),
  },
  {
    id: 'bentz-inner-translations',
    title: 'Inner Translation Digraphs',
    category: 'bentz',
    summary:
      'Analyzes cycle lengths and distinct maps among left (x -> ax) and right (x -> xa) inner translations of O_3.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'O3 := OrderPreservingTransformationSemigroup(3);;',
      'Print(InnerTranslationDigraphSummary(O3), "\\n");',
      'InspectSemigroup(O3, "Order-Preserving O_3");',
    ].join('\n'),
  },
  {
    id: 'bentz-diagram-monoids',
    title: 'Diagram Monoids (P_2, Brauer B_3, TL_3)',
    category: 'bentz',
    summary:
      'Builds the pure-GAP Partition Monoid P_2 (15), Brauer Monoid B_3 (15), and Temperley-Lieb Monoid TL_3 (5) and visualizes B_3.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'P2 := PartitionMonoid(2);;',
      'B3 := BrauerMonoid(3);;',
      'TL3 := TemperleyLiebMonoid(3);;',
      'Print("|P_2|=", Size(P2), ", |B_3|=", Size(B3), ", |TL_3|=", Size(TL3), "\\n");',
      'InspectSemigroup(B3, "Brauer Monoid B_3");',
    ].join('\n'),
  },
  {
    id: 'inspect-t3',
    title: 'Full Transformation Monoid T_3',
    category: 'eggbox',
    summary:
      'Computes order, Green’s D/R/L/H classes, and exports the Egg-Box diagram to the visualizer.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'T3 := FullTransformationMonoid(3);;',
      'SemigroupSummary(T3);',
      'InspectSemigroup(T3, "Full Transformation Monoid T_3");',
    ].join('\n'),
  },
  {
    id: 'inspect-i3',
    title: 'Symmetric Inverse Monoid I_3',
    category: 'eggbox',
    summary:
      'Builds the 34-element symmetric inverse monoid on {1,2,3} and inspects all 4 D-classes.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'I3 := SymmetricInverseMonoid(3);;',
      'SemigroupSummary(I3);',
      'InspectSemigroup(I3, "Symmetric Inverse Monoid I_3");',
    ].join('\n'),
  },
  {
    id: 'inspect-brandt',
    title: 'Brandt Semigroup B(C_2, 3)',
    category: 'eggbox',
    summary:
      'Constructs a 0-simple Brandt inverse semigroup over the cyclic group of order 2.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'B := BrandtSemigroup(CyclicGroup(2), 3);;',
      'SemigroupSummary(B);',
      'InspectSemigroup(B, "Brandt Semigroup B(C_2, 3)");',
    ].join('\n'),
  },
  {
    id: 'singular-t3',
    title: 'Singular Transformations Sing_3',
    category: 'semigroups',
    summary:
      'Explores the non-invertible ideal of T_3 (order 21) and verifies idempotent generation.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'S := SingularTransformationSemigroup(3);;',
      'Print("Order: ", Size(S), ", Idempotent-generated: ", IsIdempotentGenerated(S), "\\n");',
      'InspectSemigroup(S, "Singular Transformations Sing_3");',
    ].join('\n'),
  },
  {
    id: 'rectangular-band',
    title: 'Rectangular Band B(3, 4)',
    category: 'semigroups',
    summary:
      'Builds a 3×4 rectangular band (completely simple band with 12 idempotents).',
    code: [
      'Read("semigroups_toolkit.g");;',
      'R := RectangularBand(3, 4);;',
      'SemigroupSummary(R);',
      'InspectSemigroup(R, "Rectangular Band 3x4");',
    ].join('\n'),
  },
  {
    id: 'rees-matrix',
    title: 'Rees 0-Matrix Semigroup',
    category: 'semigroups',
    summary:
      'Defines a Rees 0-matrix semigroup over S_3 with a custom sandwich matrix and visualizes its Egg-Box diagram.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'G := SymmetricGroup(3);;',
      'P := [[(), (1,2)], [0, (1,2,3)]];;',
      'R := ReesZeroMatrixSemigroup(G, P);;',
      'DisplayEggBoxesOfSemigroup(R);',
      'InspectSemigroup(R, "Rees 0-Matrix Semigroup M^0[S_3; P]");',
    ].join('\n'),
  },
  {
    id: 'smallsemi-order4',
    title: 'Smallsemi: Semigroups of Order 4',
    category: 'packages',
    packages: ['smallsemi'],
    summary:
      'Loads the Smallsemi database and filters all 126 semigroups of order 4 for inverse semigroups.',
    code: [
      'LoadPackage("smallsemi");;',
      'Print("Total order 4: ", NrSmallSemigroups(4), "\\n");',
      'inv := Filtered(AllSmallSemigroups(4), IsInverseSemigroup);;',
      'Print("Inverse order 4: ", Length(inv), "\\n");',
      'Print("IDs: ", List(inv, IdSmallSemigroup), "\\n");',
    ].join('\n'),
  },
  {
    id: 'numericalsgps-frobenius',
    title: 'NumericalSgps: <5, 7, 11>',
    category: 'packages',
    packages: ['numericalsgps'],
    summary:
      'Computes Frobenius number, genus, gaps, and Apéry set of the numerical semigroup <5, 7, 11>.',
    code: [
      'LoadPackage("numericalsgps");;',
      'S := NumericalSemigroup(5, 7, 11);;',
      'Print("Frobenius: ", FrobeniusNumber(S), ", Genus: ", Genus(S), "\\n");',
      'Print("Gaps: ", GapsOfNumericalSemigroup(S), "\\n");',
      'Print("Apery list: ", AperyList(S), "\\n");',
    ].join('\n'),
  },
  {
    id: 'automata-syntactic',
    title: 'Automata: Transition Semigroup',
    category: 'packages',
    packages: ['automata'],
    summary:
      'Constructs a deterministic finite automaton and inspects its transition semigroup.',
    code: [
      'Read("semigroups_toolkit.g");;',
      'LoadPackage("automata");;',
      'A := Automaton("det", 3, 2, [[2, 3, 1], [1, 2, 2]], [1], [3]);;',
      'T := TransitionSemigroup(A);;',
      'Print("Transition semigroup order: ", Size(T), "\\n");',
      'DisplayEggBoxesOfSemigroup(T);',
      'InspectSemigroup(T, "Automaton Transition Semigroup");',
    ].join('\n'),
  },
  {
    id: 'group-a5-char',
    title: 'Character Table of A_5',
    category: 'groups',
    summary: 'Displays the ordinary character table of the alternating group A_5.',
    code: 'Display(CharacterTable(AlternatingGroup(5)));',
  },
  {
    id: 'group-order12',
    title: 'Groups of Order 12',
    category: 'groups',
    summary: 'Classifies all non-isomorphic groups of order 12 via StructureDescription.',
    code: 'Print(List(AllSmallGroups(12), StructureDescription), "\\n");',
  },
  {
    id: 'fp-icosahedral',
    title: 'Finitely Presented Group <a,b | a^2, b^3, (ab)^5>',
    category: 'groups',
    summary:
      'Verifies via Todd-Coxeter coset enumeration that the triangle group (2,3,5) has order 60.',
    code: [
      'F := FreeGroup("a", "b");;',
      'G := F / [F.1^2, F.2^3, (F.1*F.2)^5];;',
      'Print("Order of <a,b | a^2, b^3, (ab)^5>: ", Size(G), "\\n");',
    ].join('\n'),
  },
];
