# core-requirement

What a ruleset's things need, as data: "Musketman requires Gunpowder", "Warrior is obsoleted by Gunpowder", "Spearman is replaced by Musketman". Each package that owns a table registers it here, and the registry makes the package's rules from it, under the entries' own ids. Play runs those rules exactly as before; the civilopedia and "why can't I build this?" read the entries (civ-clone/web-renderer#37).

- **`Requirement`**: one entry: an `id` (the same as the rule made from it), a `subject` class, a `relation` (`requires`, `excludedBy`, `obsoletedBy`, `replacedBy`, `enhancedBy`, or one a plugin declares), its `targets` (classes, or a `Condition` the graph names but a hand-written rule decides), how they combine (`mode`: `all` or `any`), whose possession counts (`range`: `tile`, `city`, `player` or `world`) and, optionally, `where` the subject must be (the terrains a tile improvement can go on).
- **`table(idPrefix, relation, rows)`** makes entries from rows of `[Subject, ...targets]`; **`met(entry, has)`** says whether an entry's targets are met.
- **`RequirementRegistry`**, a game's `requirements` slot: `add(derive, ...entries)` holds entries and registers the rules `derive` makes from each; `for(Subject)` and `leadsTo(Target)` read the graph either way; `replace(id, ...entries)` and `remove(id)` change an entry and its rules together. An unknown id throws, as `RuleRegistry`'s do.

The entries are definitions: nothing here is saved.
