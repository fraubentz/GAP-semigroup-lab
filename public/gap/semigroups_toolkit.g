# ============================================================================
# semigroups_toolkit.g — Pure-GAP Semigroup Theory & Research Workbench
# Runs natively inside GAP 4 WebAssembly (gap.wasm).
# Includes core semigroup constructors, Egg-Box / Green's class inspection,
# diagram monoids, partition-stabilizing semigroups, semigroup conjugacy,
# complete mappings, transversal properties (k-et / k-ut), and inner
# translation functional digraphs.
# ============================================================================

if not IsBound(JSONStringEscape_Toolkit) then
  JSONStringEscape_Toolkit := function(str)
    local out, ch, i;
    out := "";
    for i in [1..Length(str)] do
      ch := str[i];
      if ch = '\\' then
        Append(out, "\\\\");
      elif ch = '"' then
        Append(out, "\\\"");
      elif ch = '\n' then
        Append(out, "\\n");
      elif ch = '\r' then
        Append(out, "\\r");
      elif ch = '\t' then
        Append(out, "\\t");
      else
        Add(out, ch);
      fi;
    od;
    return out;
  end;
fi;

# ----------------------------------------------------------------------------
# 1. Standard Transformation, Band, and Brandt Semigroups
# ----------------------------------------------------------------------------

if not IsBound(SingularTransformationSemigroup) then
  SingularTransformationSemigroup := function(n)
    if n < 2 then
      Error("SingularTransformationSemigroup requires n >= 2");
    fi;
    return Semigroup(Filtered(Elements(FullTransformationMonoid(n)),
      t -> RankOfTransformation(t, n) < n));
  end;
fi;

if not IsBound(OrderPreservingTransformationSemigroup) then
  OrderPreservingTransformationSemigroup := function(n)
    local elts, t;
    if n < 1 then
      Error("OrderPreservingTransformationSemigroup requires n >= 1");
    fi;
    elts := [];
    for t in Elements(FullTransformationMonoid(n)) do
      if ForAll([1..n-1], i -> i^t <= (i+1)^t) then
        Add(elts, t);
      fi;
    od;
    return Semigroup(elts);
  end;
fi;

if not IsBound(ZeroSemigroup) then
  ZeroSemigroup := function(n)
    local tbl, i, M;
    tbl := List([1..n], i -> List([1..n], j -> 1));
    M := MagmaByMultiplicationTable(tbl);
    SetIsAssociative(M, true);
    return M;
  end;
fi;

if not IsBound(LeftZeroSemigroup) then
  LeftZeroSemigroup := function(n)
    local tbl, i, M;
    tbl := List([1..n], i -> List([1..n], j -> i));
    M := MagmaByMultiplicationTable(tbl);
    SetIsAssociative(M, true);
    return M;
  end;
fi;

if not IsBound(RightZeroSemigroup) then
  RightZeroSemigroup := function(n)
    local tbl, i, M;
    tbl := List([1..n], i -> List([1..n], j -> j));
    M := MagmaByMultiplicationTable(tbl);
    SetIsAssociative(M, true);
    return M;
  end;
fi;

if not IsBound(RectangularBand) then
  RectangularBand := function(m, n)
    local elts, tbl, i, j, a, b, M;
    elts := Cartesian([1..m], [1..n]);
    tbl := [];
    for i in [1..Length(elts)] do
      a := elts[i];
      Add(tbl, []);
      for j in [1..Length(elts)] do
        b := elts[j];
        Add(tbl[i], Position(elts, [a[1], b[2]]));
      od;
    od;
    M := MagmaByMultiplicationTable(tbl);
    SetIsAssociative(M, true);
    return M;
  end;
fi;

if not IsBound(BrandtSemigroup) then
  BrandtSemigroup := function(G, n)
    local mat, i, j, row, id;
    id := One(G);
    mat := [];
    for i in [1..n] do
      row := [];
      for j in [1..n] do
        if i = j then
          Add(row, id);
        else
          Add(row, 0);
        fi;
      od;
      Add(mat, row);
    od;
    return ReesZeroMatrixSemigroup(G, mat);
  end;
fi;

# ----------------------------------------------------------------------------
# 2. Partition-Stabilizing Transformation Semigroups T(X, P) & S(X, P)
#    (Araujo, Bentz, Mitchell, Schneider, Math. Proc. Camb. Phil. Soc. 2015)
# ----------------------------------------------------------------------------

if not IsBound(PartitionBlockIndex) then
  PartitionBlockIndex := function(n, P)
    local blockOf, bIdx, x;
    blockOf := List([1..n], i -> 0);
    for bIdx in [1..Length(P)] do
      for x in P[bIdx] do
        blockOf[x] := bIdx;
      od;
    od;
    return blockOf;
  end;
fi;

if not IsBound(PartitionStabilizingSemigroup) then
  PartitionStabilizingSemigroup := function(n, P)
    local blockOf, elts, t, ok, b, bImg, x;
    blockOf := PartitionBlockIndex(n, P);
    elts := [];
    for t in Elements(FullTransformationMonoid(n)) do
      ok := true;
      for b in P do
        bImg := blockOf[b[1]^t];
        for x in b do
          if blockOf[x^t] <> bImg then
            ok := false;
            break;
          fi;
        od;
        if not ok then break; fi;
      od;
      if ok then Add(elts, t); fi;
    od;
    return Semigroup(elts);
  end;
fi;

if not IsBound(PartitionFixingSemigroup) then
  PartitionFixingSemigroup := function(n, P)
    local blockOf, elts, t, ok, bIdx, x;
    blockOf := PartitionBlockIndex(n, P);
    elts := [];
    for t in Elements(FullTransformationMonoid(n)) do
      ok := true;
      for bIdx in [1..Length(P)] do
        for x in P[bIdx] do
          if blockOf[x^t] <> bIdx then
            ok := false;
            break;
          fi;
        od;
        if not ok then break; fi;
      od;
      if ok then Add(elts, t); fi;
    od;
    return Semigroup(elts);
  end;
fi;

if not IsBound(PartitionPreservingPermutations) then
  PartitionPreservingPermutations := function(n, P)
    local blockOf, gens, g, ok, b, bImg, x;
    blockOf := PartitionBlockIndex(n, P);
    gens := [];
    for g in Elements(SymmetricGroup(n)) do
      ok := true;
      for b in P do
        bImg := blockOf[b[1]^g];
        for x in b do
          if blockOf[x^g] <> bImg then
            ok := false;
            break;
          fi;
        od;
        if not ok then break; fi;
      od;
      if ok then Add(gens, g); fi;
    od;
    return Group(gens);
  end;
fi;

# ----------------------------------------------------------------------------
# 3. Diagram & Partition Monoids (Pure-GAP representation)
#    Supports PartitionMonoid(n), BrauerMonoid(n), TemperleyLiebMonoid(n)
# ----------------------------------------------------------------------------

if not IsBound(MultiplySetPartitions) then
  MultiplySetPartitions := function(n, p1, p2)
    # p1, p2 are partitions of [-n..-1, 1..n] represented as sorted lists of sorted blocks
    # Upper row: [1..n], Lower row: [-1..-n]
    local adj, comp, visited, queue, head, cur, nxt, b, i, u, v, newBlocks, blk,
          posTop, posBot, remap;
    # Represent vertices 1..n (top of p1), n+1..2n (middle), 2n+1..3n (bottom of p2)
    adj := List([1..3*n], i -> []);
    for b in p1 do
      remap := List(b, function(x)
        if x > 0 then return x; else return n + (-x); fi;
      end);
      for i in [2..Length(remap)] do
        Add(adj[remap[1]], remap[i]);
        Add(adj[remap[i]], remap[1]);
      od;
    od;
    for b in p2 do
      remap := List(b, function(x)
        if x > 0 then return n + x; else return 2*n + (-x); fi;
      end);
      for i in [2..Length(remap)] do
        Add(adj[remap[1]], remap[i]);
        Add(adj[remap[i]], remap[1]);
      od;
    od;
    visited := List([1..3*n], i -> false);
    newBlocks := [];
    for i in [1..3*n] do
      if not visited[i] then
        visited[i] := true;
        queue := [i];
        head := 1;
        comp := [];
        while head <= Length(queue) do
          cur := queue[head];
          head := head + 1;
          if cur <= n then
            Add(comp, cur);
          elif cur > 2*n then
            Add(comp, -(cur - 2*n));
          fi;
          for nxt in adj[cur] do
            if not visited[nxt] then
              visited[nxt] := true;
              Add(queue, nxt);
            fi;
          od;
        od;
        if Length(comp) > 0 then
          Sort(comp);
          Add(newBlocks, comp);
        fi;
      fi;
    od;
    Sort(newBlocks);
    return newBlocks;
  end;
fi;

if not IsBound(DiagramMonoidByParts) then
  DiagramMonoidByParts := function(n, parts)
    local m, tbl, i, j, prod, pos, M;
    m := Length(parts);
    tbl := [];
    for i in [1..m] do
      Add(tbl, []);
      for j in [1..m] do
        prod := MultiplySetPartitions(n, parts[i], parts[j]);
        pos := Position(parts, prod);
        Add(tbl[i], pos);
      od;
    od;
    M := MagmaByMultiplicationTable(tbl);
    SetIsAssociative(M, true);
    return M;
  end;
fi;

if not IsBound(PartitionMonoid) then
  PartitionMonoid := function(n)
    local domain, parts;
    if n > 3 then
      Error("Pure-GAP PartitionMonoid supports n <= 3 (|P_3| = 203)");
    fi;
    domain := Concatenation([-n..-1], [1..n]);
    parts := List(PartitionsSet(domain), function(p)
      local q;
      q := List(p, Set);
      Sort(q);
      return q;
    end);
    Sort(parts);
    return DiagramMonoidByParts(n, parts);
  end;
fi;

if not IsBound(BrauerMonoid) then
  BrauerMonoid := function(n)
    local domain, parts;
    if n > 4 then
      Error("Pure-GAP BrauerMonoid supports n <= 4 (|B_4| = 105)");
    fi;
    domain := Concatenation([-n..-1], [1..n]);
    parts := Filtered(PartitionsSet(domain), p -> ForAll(p, b -> Length(b) = 2));
    parts := List(parts, function(p)
      local q;
      q := List(p, Set);
      Sort(q);
      return q;
    end);
    Sort(parts);
    return DiagramMonoidByParts(n, parts);
  end;
fi;

if not IsBound(TemperleyLiebMonoid) then
  TemperleyLiebMonoid := function(n)
    local domain, parts, ringOrder, isNonCrossing, p;
    if n > 4 then
      Error("Pure-GAP TemperleyLiebMonoid supports n <= 4");
    fi;
    # Clockwise boundary order: 1..n, then -n..-1
    ringOrder := Concatenation([1..n], Reversed([-n..-1]));
    isNonCrossing := function(part)
      local pairs, idx, b, i, j, a1, b1, a2, b2;
      pairs := List(part, function(blk)
        local p1, p2;
        p1 := Position(ringOrder, blk[1]);
        p2 := Position(ringOrder, blk[2]);
        if p1 < p2 then return [p1, p2]; else return [p2, p1]; fi;
      end);
      for i in [1..Length(pairs)] do
        a1 := pairs[i][1]; b1 := pairs[i][2];
        for j in [i+1..Length(pairs)] do
          a2 := pairs[j][1]; b2 := pairs[j][2];
          if (a1 < a2 and a2 < b1 and b1 < b2) or (a2 < a1 and a1 < b2 and b2 < b1) then
            return false;
          fi;
        od;
      od;
      return true;
    end;
    domain := Concatenation([-n..-1], [1..n]);
    parts := Filtered(PartitionsSet(domain),
      p -> ForAll(p, b -> Length(b) = 2) and isNonCrossing(p));
    parts := List(parts, function(p)
      local q;
      q := List(p, Set);
      Sort(q);
      return q;
    end);
    Sort(parts);
    return DiagramMonoidByParts(n, parts);
  end;
fi;

# ----------------------------------------------------------------------------
# 4. Semigroup Conjugacy Relations (~_p*, ~_o, ~_c via units)
#    (Araujo, Bentz, Kinyon, Konieczny, Malheiro, Mercier, J. Algebra 2026)
# ----------------------------------------------------------------------------

if not IsBound(SemigroupConjugacyStats) then
  SemigroupConjugacyStats := function(S)
    local elts, n, prod, i, j, x, y, adjP, pDirect, visited, classesP, queue,
          head, cur, nxt, cls, pIsTrans, adjO, u, v, okO, classesO, units,
          adjU, g, gInv, classesU, isMon;
    elts := Elements(S);
    n := Length(elts);
    prod := List([1..n], i -> List([1..n], j -> Position(elts, elts[i] * elts[j])));

    # Direct ~_p: a = xy, b = yx for x, y in S^1 (so a=b is always in ~_p)
    pDirect := List([1..n], i -> List([1..n], j -> i = j));
    for x in [1..n] do
      for y in [1..n] do
        i := prod[x][y];
        j := prod[y][x];
        pDirect[i][j] := true;
        pDirect[j][i] := true;
      od;
    od;

    # Transitive closure ~_p^*
    visited := List([1..n], i -> false);
    classesP := [];
    pIsTrans := true;
    for i in [1..n] do
      if not visited[i] then
        visited[i] := true;
        queue := [i];
        head := 1;
        cls := [];
        while head <= Length(queue) do
          cur := queue[head];
          head := head + 1;
          Add(cls, cur);
          for nxt in [1..n] do
            if pDirect[cur][nxt] and not visited[nxt] then
              visited[nxt] := true;
              Add(queue, nxt);
            fi;
          od;
        od;
        Sort(cls);
        if pIsTrans then
          for x in cls do
            for y in cls do
              if not pDirect[x][y] then
                pIsTrans := false;
              fi;
            od;
          od;
        fi;
        Add(classesP, cls);
      fi;
    od;

    # Otto conjugacy ~_o: exists u, v in S^1 with au = ub and bv = va
    # Note S^1 includes 1 (which satisfies a*1 = 1*a)
    adjO := List([1..n], i -> List([1..n], j -> i = j));
    for i in [1..n] do
      for j in [i+1..n] do
        # Check exists u in S^1: elts[i]*u = u*elts[j]
        okO := ForAny([1..n], u -> prod[i][u] = prod[u][j]) and
               ForAny([1..n], v -> prod[j][v] = prod[v][i]);
        if okO then
          adjO[i][j] := true;
          adjO[j][i] := true;
        fi;
      od;
    od;
    visited := List([1..n], i -> false);
    classesO := [];
    for i in [1..n] do
      if not visited[i] then
        visited[i] := true;
        queue := [i];
        head := 1;
        cls := [];
        while head <= Length(queue) do
          cur := queue[head];
          head := head + 1;
          Add(cls, cur);
          for nxt in [1..n] do
            if adjO[cur][nxt] and not visited[nxt] then
              visited[nxt] := true;
              Add(queue, nxt);
            fi;
          od;
        od;
        Add(classesO, cls);
      fi;
    od;

    # Unit conjugacy ~_c if S is a monoid
    isMon := IsMonoidAsSemigroup(S);
    classesU := fail;
    if isMon then
      units := Filtered([1..n], g -> ForAny([1..n], h ->
        ForAll([1..n], z -> prod[prod[g][h]][z] = z and prod[z][prod[h][g]] = z)));
      adjU := List([1..n], i -> List([1..n], j -> i = j));
      for i in [1..n] do
        for g in units do
          gInv := First(units, h -> ForAll([1..n], z -> prod[prod[g][h]][z] = z));
          if gInv <> fail then
            j := prod[prod[gInv][i]][g];
            adjU[i][j] := true;
            adjU[j][i] := true;
          fi;
        od;
      od;
      visited := List([1..n], i -> false);
      classesU := [];
      for i in [1..n] do
        if not visited[i] then
          visited[i] := true;
          queue := [i];
          head := 1;
          cls := [];
          while head <= Length(queue) do
            cur := queue[head];
            head := head + 1;
            Add(cls, cur);
            for nxt in [1..n] do
              if adjU[cur][nxt] and not visited[nxt] then
                visited[nxt] := true;
                Add(queue, nxt);
              fi;
            od;
          od;
          Add(classesU, cls);
        fi;
      od;
    fi;

    return rec(
      primaryClasses := classesP,
      primaryTransitive := pIsTrans,
      ottoClasses := classesO,
      unitClasses := classesU
    );
  end;
fi;

if not IsBound(ConjugacyGrowthProfile) then
  ConjugacyGrowthProfile := function(S)
    local st;
    if Size(S) > 80 then
      Error("ConjugacyGrowthProfile supports finite semigroups with |S| <= 80");
    fi;
    st := SemigroupConjugacyStats(S);
    Print("Semigroup Conjugacy Profile (|S| = ", Size(S), ")\n");
    Print("----------------------------------------\n");
    Print("~_p* classes (xy ~ yx): ", Length(st.primaryClasses),
          " (direct ~_p transitive: ", st.primaryTransitive, ")\n");
    Print("~_o  classes (Otto):    ", Length(st.ottoClasses), "\n");
    if st.unitClasses <> fail then
      Print("~_c  classes (units):   ", Length(st.unitClasses), "\n");
    else
      Print("~_c  classes (units):   n/a (not a monoid)\n");
    fi;
    return st;
  end;
fi;

# ----------------------------------------------------------------------------
# 5. Complete Mappings of Finite Semigroups
#    (Araujo, Bentz, Cameron, Hendrey, Kinyon, 2026)
# ----------------------------------------------------------------------------

if not IsBound(IsCompleteMapping) then
  IsCompleteMapping := function(S, perm)
    local elts, n, seen, i, pos;
    elts := Elements(S);
    n := Length(elts);
    seen := List([1..n], i -> false);
    for i in [1..n] do
      pos := Position(elts, elts[i] * elts[i^perm]);
      if seen[pos] then
        return false;
      fi;
      seen[pos] := true;
    od;
    return true;
  end;
fi;

if not IsBound(CompleteMappingSearch) then
  CompleteMappingSearch := function(S)
    local elts, n, prod, z, usedA, usedP, alpha, search;
    n := Size(S);
    if n = 1 then
      return rec(exists := true, perm := (), reason := "Trivial semigroup");
    fi;
    z := MultiplicativeZero(S);
    if z <> fail then
      return rec(
        exists := false,
        perm := fail,
        reason := "Multiplicative zero obstruction (0*a(0) = 0 collides with a^-1(0)*0)"
      );
    fi;
    if n > 9 then
      return rec(
        exists := fail,
        perm := fail,
        reason := Concatenation("Exhaustive search skipped for |S| = ", String(n), " > 9")
      );
    fi;

    elts := Elements(S);
    prod := List([1..n], i -> List([1..n], j -> Position(elts, elts[i] * elts[j])));
    usedA := List([1..n], i -> false);
    usedP := List([1..n], i -> false);
    alpha := List([1..n], i -> 0);

    search := function(idx)
      local j, p;
      if idx > n then
        return true;
      fi;
      for j in [1..n] do
        if not usedA[j] then
          p := prod[idx][j];
          if not usedP[p] then
            usedA[j] := true;
            usedP[p] := true;
            alpha[idx] := j;
            if search(idx + 1) then
              return true;
            fi;
            usedA[j] := false;
            usedP[p] := false;
          fi;
        fi;
      od;
      return false;
    end;

    if search(1) then
      return rec(
        exists := true,
        perm := PermList(alpha),
        reason := "Complete mapping bijection found"
      );
    fi;
    return rec(
      exists := false,
      perm := fail,
      reason := "Exhaustive backtrack: no complete mapping exists"
    );
  end;
fi;

# ----------------------------------------------------------------------------
# 6. Existential & Universal Transversal Properties (k-et, k-ut)
#    (Araujo, Bentz, Cameron, Trans. AMS 2020)
# ----------------------------------------------------------------------------

if not IsBound(IsTransversalOfPartition) then
  IsTransversalOfPartition := function(subset, partition)
    local b;
    if Length(subset) <> Length(partition) then
      return false;
    fi;
    return ForAll(partition, b -> Length(Intersection(subset, b)) = 1);
  end;
fi;

if not IsBound(HasKUT) then
  HasKUT := function(G, n, k)
    local parts, subsets, A, P;
    parts := PartitionsSet([1..n], k);
    subsets := Combinations([1..n], k);
    for A in subsets do
      for P in parts do
        if not ForAny(G, g -> IsTransversalOfPartition(OnSets(A, g), P)) then
          return false;
        fi;
      od;
    od;
    return true;
  end;
fi;

if not IsBound(HasKET) then
  HasKET := function(G, n, k)
    local parts, subsets, A, P;
    parts := PartitionsSet([1..n], k);
    subsets := Combinations([1..n], k);
    for A in subsets do
      if ForAll(parts, P -> ForAny(G, g -> IsTransversalOfPartition(OnSets(A, g), P))) then
        return rec(hasKET := true, witness := A);
      fi;
    od;
    return rec(hasKET := false, witness := fail);
  end;
fi;

if not IsBound(TransversalRegularityTest) then
  TransversalRegularityTest := function(G, n, k)
    local ket, kut, gens, img, i, b, P, t, S, reg;
    kut := HasKUT(G, n, k);
    ket := HasKET(G, n, k);
    Print("Group order: ", Size(G), ", degree: ", n, ", k: ", k, "\n");
    Print(k, "-ut (universal transversal): ", kut, "\n");
    Print(k, "-et (existential transversal): ", ket.hasKET);
    if ket.hasKET then
      Print(" (witness ", ket.witness, ")");
    fi;
    Print("\n");
    if ket.hasKET then
      P := PartitionsSet([1..n], k)[1];
      img := [1..n];
      for i in [1..k] do
        for b in P[i] do
          img[b] := ket.witness[i];
        od;
      od;
      t := Transformation(img);
      gens := Concatenation(List(GeneratorsOfGroup(G), g -> AsTransformation(g, n)), [t]);
      S := Semigroup(gens);
      reg := IsRegularSemigroup(S);
      Print("Regularity of <G, t> for witness transversal t: ", reg, "\n");
    fi;
    return rec(kut := kut, ket := ket.hasKET, witness := ket.witness);
  end;
fi;

# ----------------------------------------------------------------------------
# 7. Directed Graphs of Inner Translations of Semigroups
#    (Araujo, Bentz, Konieczny, Semigroup Forum 2017)
# ----------------------------------------------------------------------------

if not IsBound(LeftInnerTranslation) then
  LeftInnerTranslation := function(S, a)
    local elts;
    elts := Elements(S);
    return Transformation(List(elts, x -> Position(elts, a * x)));
  end;
fi;

if not IsBound(RightInnerTranslation) then
  RightInnerTranslation := function(S, a)
    local elts;
    elts := Elements(S);
    return Transformation(List(elts, x -> Position(elts, x * a)));
  end;
fi;

if not IsBound(FunctionalDigraphCycleLengths) then
  FunctionalDigraphCycleLengths := function(t, n)
    local state, cycLens, i, cur, path, idx, len;
    # state: 0=unvisited, 1=visiting, 2=done
    state := List([1..n], i -> 0);
    cycLens := [];
    for i in [1..n] do
      if state[i] = 0 then
        path := [];
        cur := i;
        while state[cur] = 0 do
          state[cur] := 1;
          Add(path, cur);
          cur := cur^t;
        od;
        if state[cur] = 1 then
          idx := Position(path, cur);
          len := Length(path) - idx + 1;
          Add(cycLens, len);
        fi;
        for cur in path do
          state[cur] := 2;
        od;
      fi;
    od;
    return Set(cycLens);
  end;
fi;

if not IsBound(InnerTranslationDigraphSummary) then
  InnerTranslationDigraphSummary := function(S)
    local elts, n, leftTrans, rightTrans, leftCycles, rightCycles, a, t;
    elts := Elements(S);
    n := Length(elts);
    leftTrans := [];
    rightTrans := [];
    leftCycles := [];
    rightCycles := [];
    for a in elts do
      t := Transformation(List(elts, x -> Position(elts, a * x)));
      Add(leftTrans, t);
      UniteSet(leftCycles, FunctionalDigraphCycleLengths(t, n));
      t := Transformation(List(elts, x -> Position(elts, x * a)));
      Add(rightTrans, t);
      UniteSet(rightCycles, FunctionalDigraphCycleLengths(t, n));
    od;
    return rec(
      leftDistinctCount := Length(Set(leftTrans)),
      rightDistinctCount := Length(Set(rightTrans)),
      leftCycleLengths := leftCycles,
      rightCycleLengths := rightCycles
    );
  end;
fi;

# ----------------------------------------------------------------------------
# 8. SemigroupSummary & InspectSemigroup (JSON bridge to Egg-Box Visualizer)
# ----------------------------------------------------------------------------

if not IsBound(SemigroupSummary) then
  SemigroupSummary := function(S)
    local dclasses, rclasses, lclasses, hclasses, idems;
    if not IsSemigroup(S) then
      Error("Expected a semigroup");
    fi;
    dclasses := GreensDClasses(S);
    rclasses := GreensRClasses(S);
    lclasses := GreensLClasses(S);
    hclasses := GreensHClasses(S);
    idems := Idempotents(S);
    Print("Semigroup Summary\n");
    Print("----------------------------------------\n");
    Print("Order:               ", Size(S), "\n");
    Print("Generators:          ", Length(GeneratorsOfSemigroup(S)), "\n");
    Print("Idempotents:         ", Length(idems), "\n");
    Print("D / R / L / H:       ", Length(dclasses), " / ", Length(rclasses),
          " / ", Length(lclasses), " / ", Length(hclasses), "\n");
    Print("Regular:             ", IsRegularSemigroup(S), "\n");
    Print("Inverse:             ", IsInverseSemigroup(S), "\n");
    Print("Band / Semilattice:  ", IsBand(S), " / ", IsSemilattice(S), "\n");
    Print("Commutative:         ", IsCommutativeSemigroup(S), "\n");
    Print("Simple / 0-Simple:   ", IsSimpleSemigroup(S), " / ", IsZeroSimpleSemigroup(S), "\n");
    Print("Clifford / Orthodox: ", IsCliffordSemigroup(S), " / ", IsOrthodoxSemigroup(S), "\n");
    Print("Completely Regular:  ", IsCompletelyRegularSemigroup(S), "\n");
  end;
fi;

if not IsBound(InspectSemigroup) then
  InspectSemigroup := function(arg)
    local S, label, filename, out, dclasses, dIdx, D, rclasses, lclasses,
          egg, rIdx, lIdx, H, hSize, isGrp, isReg, elts, i, j, pos,
          gens, idems, props, firstD, firstR, firstL, repStr,
          conj, trans, compMap, formatIntList;
    S := arg[1];
    if not IsSemigroup(S) then
      Error("InspectSemigroup(S[, label[, filename]]) expects a semigroup");
    fi;
    if Length(arg) >= 2 then
      label := String(arg[2]);
    else
      label := ViewString(S);
    fi;
    if Length(arg) >= 3 then
      filename := String(arg[3]);
    else
      filename := "semigroup_inspect.json";
    fi;

    formatIntList := function(lst)
      local s, k;
      s := "[";
      for k in [1..Length(lst)] do
        if k > 1 then Append(s, ", "); fi;
        Append(s, String(lst[k]));
      od;
      Append(s, "]");
      return s;
    end;

    dclasses := GreensDClasses(S);
    idems := Idempotents(S);
    gens := GeneratorsOfSemigroup(S);

    out := "{\n";
    Append(out, Concatenation("  \"label\": \"", JSONStringEscape_Toolkit(label), "\",\n"));
    Append(out, Concatenation("  \"order\": ", String(Size(S)), ",\n"));
    Append(out, Concatenation("  \"generatorCount\": ", String(Length(gens)), ",\n"));
    Append(out, Concatenation("  \"idempotentCount\": ", String(Length(idems)), ",\n"));
    Append(out, Concatenation("  \"rClassCount\": ", String(Length(GreensRClasses(S))), ",\n"));
    Append(out, Concatenation("  \"lClassCount\": ", String(Length(GreensLClasses(S))), ",\n"));
    Append(out, Concatenation("  \"hClassCount\": ", String(Length(GreensHClasses(S))), ",\n"));

    props := [
      ["regular", IsRegularSemigroup(S)],
      ["inverse", IsInverseSemigroup(S)],
      ["band", IsBand(S)],
      ["semilattice", IsSemilattice(S)],
      ["commutative", IsCommutativeSemigroup(S)],
      ["simple", IsSimpleSemigroup(S)],
      ["zeroSimple", IsZeroSimpleSemigroup(S)],
      ["clifford", IsCliffordSemigroup(S)],
      ["orthodox", IsOrthodoxSemigroup(S)],
      ["completelyRegular", IsCompletelyRegularSemigroup(S)],
      ["monoid", IsMonoidAsSemigroup(S)],
      ["group", IsGroupAsSemigroup(S)]
    ];
    Append(out, "  \"properties\": {\n");
    for i in [1..Length(props)] do
      Append(out, Concatenation("    \"", props[i][1], "\": ",
        LowercaseString(String(props[i][2]))));
      if i < Length(props) then Append(out, ","); fi;
      Append(out, "\n");
    od;
    Append(out, "  },\n");

    Append(out, "  \"dClasses\": [\n");
    firstD := true;
    for dIdx in [1..Length(dclasses)] do
      D := dclasses[dIdx];
      if not firstD then Append(out, ",\n"); fi;
      firstD := false;
      rclasses := GreensRClasses(D);
      lclasses := GreensLClasses(D);
      egg := EggBoxOfDClass(D);
      isReg := IsRegularDClass(D);
      repStr := JSONStringEscape_Toolkit(ViewString(Representative(D)));

      Append(out, "    {\n");
      Append(out, Concatenation("      \"index\": ", String(dIdx), ",\n"));
      Append(out, Concatenation("      \"size\": ", String(Size(D)), ",\n"));
      Append(out, Concatenation("      \"regular\": ", LowercaseString(String(isReg)), ",\n"));
      Append(out, Concatenation("      \"rCount\": ", String(Length(rclasses)), ",\n"));
      Append(out, Concatenation("      \"lCount\": ", String(Length(lclasses)), ",\n"));
      Append(out, Concatenation("      \"representative\": \"", repStr, "\",\n"));
      Append(out, "      \"eggBox\": [\n");

      firstR := true;
      for rIdx in [1..Length(rclasses)] do
        if not firstR then Append(out, ",\n"); fi;
        firstR := false;
        Append(out, "        [");
        firstL := true;
        for lIdx in [1..Length(lclasses)] do
          if not firstL then Append(out, ", "); fi;
          firstL := false;
          H := egg[rIdx][lIdx];
          hSize := Size(H);
          isGrp := IsGroupHClass(H);
          Append(out, Concatenation("{\"size\": ", String(hSize),
            ", \"isGroup\": ", LowercaseString(String(isGrp)),
            ", \"rep\": \"", JSONStringEscape_Toolkit(ViewString(Representative(H))), "\"}"));
        od;
        Append(out, "]");
      od;
      Append(out, "\n      ]\n");
      Append(out, "    }");
    od;
    Append(out, "\n  ]");

    if Size(S) <= 48 then
      conj := SemigroupConjugacyStats(S);
      trans := InnerTranslationDigraphSummary(S);
      Append(out, ",\n  \"conjugacy\": {\n");
      Append(out, Concatenation("    \"primaryClasses\": ", String(Length(conj.primaryClasses)), ",\n"));
      Append(out, Concatenation("    \"primaryTransitive\": ", LowercaseString(String(conj.primaryTransitive)), ",\n"));
      Append(out, Concatenation("    \"ottoClasses\": ", String(Length(conj.ottoClasses)), ",\n"));
      if conj.unitClasses <> fail then
        Append(out, Concatenation("    \"unitClasses\": ", String(Length(conj.unitClasses)), "\n"));
      else
        Append(out, "    \"unitClasses\": null\n");
      fi;
      Append(out, "  },\n  \"innerTranslations\": {\n");
      Append(out, Concatenation("    \"leftDistinctCount\": ", String(trans.leftDistinctCount), ",\n"));
      Append(out, Concatenation("    \"rightDistinctCount\": ", String(trans.rightDistinctCount), ",\n"));
      Append(out, Concatenation("    \"leftCycleLengths\": ", formatIntList(trans.leftCycleLengths), ",\n"));
      Append(out, Concatenation("    \"rightCycleLengths\": ", formatIntList(trans.rightCycleLengths), "\n"));
      Append(out, "  }");
    fi;

    compMap := CompleteMappingSearch(S);
    Append(out, ",\n  \"completeMapping\": {\n");
    if compMap.exists = fail then
      Append(out, "    \"exists\": null,\n");
    else
      Append(out, Concatenation("    \"exists\": ", LowercaseString(String(compMap.exists)), ",\n"));
    fi;
    Append(out, Concatenation("    \"reason\": \"", JSONStringEscape_Toolkit(compMap.reason), "\"\n"));
    Append(out, "  }");

    if Size(S) <= 24 then
      elts := Elements(S);
      Append(out, ",\n  \"elements\": [");
      for i in [1..Length(elts)] do
        if i > 1 then Append(out, ", "); fi;
        Append(out, Concatenation("\"", JSONStringEscape_Toolkit(ViewString(elts[i])), "\""));
      od;
      Append(out, "],\n  \"cayleyTable\": [\n");
      for i in [1..Length(elts)] do
        Append(out, "    [");
        for j in [1..Length(elts)] do
          if j > 1 then Append(out, ", "); fi;
          pos := Position(elts, elts[i] * elts[j]);
          Append(out, String(pos));
        od;
        Append(out, "]");
        if i < Length(elts) then Append(out, ","); fi;
        Append(out, "\n");
      od;
      Append(out, "  ]\n");
    else
      Append(out, "\n");
    fi;

    Append(out, "}\n");
    PrintTo(filename, out);
    Print("Inspected semigroup '", label, "' (order ", Size(S),
          ", ", Length(dclasses), " D-classes) -> ", filename, "\n");
  end;
fi;
