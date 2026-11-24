# Semigroup Theory & Research Lab Script
# Run inside GAP with: Read("semigroup_lab.g");

Read("semigroups_toolkit.g");

# 1. Full Transformation Monoid T_3: Egg-Box, Conjugacy & Translations
T3 := FullTransformationMonoid(3);;
SemigroupSummary(T3);
ConjugacyGrowthProfile(T3);
InspectSemigroup(T3, "Full Transformation Monoid T_3");

# 2. Partition-stabilizing semigroup T(4, {{1,2},{3,4}})
S_part := PartitionStabilizingSemigroup(4, [[1, 2], [3, 4]]);;
Print("Order of T(4, {{1,2},{3,4}}): ", Size(S_part), "\n");

# 3. Transversal property check: 2-et & 2-ut for A_4 on {1..4}
TransversalRegularityTest(AlternatingGroup(4), 4, 2);
