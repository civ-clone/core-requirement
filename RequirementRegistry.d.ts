import { IRequirement, Relation, Requirement, Target } from './Requirement';
import { RuleRegistry } from '@civ-clone/core-rule/RuleRegistry';
import { EntityRegistry } from '@civ-clone/core-registry/EntityRegistry';
import { IConstructor } from '@civ-clone/core-registry/Registry';
import Rule from '@civ-clone/core-rule/Rule';
/**
 * The rules an entry is played by, made by the package that owns it: it knows how to tell whether a player has an
 * advance, a city has an improvement, and so on, so this package needn't. The registry is passed too, for a rule that
 * folds several entries into one (a government available by any of several paths).
 */
export type Deriver = (
  entry: Requirement,
  requirements: RequirementRegistry
) => Rule[];
export declare class UnknownRequirementError extends Error {}
export declare class DuplicateRequirementIdError extends Error {}
/**
 * Every requirement a ruleset declares, and the rules made from each (civ-clone/web-renderer#37).
 *
 * The rules are what play runs, under the entries' own ids, exactly as if they had been written out; this registry is
 * only read when something asks about the graph (the civilopedia, "why can't I build this?"). Changing an entry
 * changes its rules with it, so a plugin edits one place and the civilopedia never says one thing while the game does
 * another.
 *
 * `rules.replace` on a derived rule still works, as the way out for behaviour the graph can't say. The entry still owns
 * the ids of the rules it made, though: replacing or removing the entry takes out whatever rule is registered under
 * them by then, the plugin's included, so the last change made wins. (A plugin's replacement with no id can't be found
 * that way, and stays.)
 *
 * Every change is checked in full before anything is touched, so one that is refused leaves the registry, and the
 * game's rules, as they were.
 */
export declare class RequirementRegistry extends EntityRegistry<Requirement> {
  private _byId;
  private _bySubject;
  private _derived;
  private _derivers;
  private _added;
  private _nextAdded;
  private _rules;
  constructor(rules?: RuleRegistry);
  /**
   * Holds `entries` and registers the rules `derive` makes from each, in order. `derive` is `null` for an entry whose
   * rule is written by hand (a state condition), which the entry only describes. An entry may be given as a plain
   * object, and is held as a `Requirement`.
   */
  add(derive: Deriver | null, ...entries: (Requirement | IRequirement)[]): void;
  /** As `add`, with no rules made: the entries only describe. */
  register(...entries: Requirement[]): void;
  /** The entry registered as `id`, or `null`. */
  getById(id: string): Requirement | null;
  /**
   * The entries about `Subject`, or a class it extends, optionally only those of one relation, in the order they were
   * added.
   */
  for(Subject: IConstructor, relation?: Relation): Requirement[];
  /** The entries that name `target`: what an advance leads to, what a Wonder makes obsolete. */
  leadsTo(target: Target, relation?: Relation): Requirement[];
  /**
   * Swaps the entry registered as `id` for `entries`, and its rules for the ones the same deriver makes from them. The
   * replacements needn't keep the id. Throws for an id nothing is registered as, as a mistyped plugin should.
   */
  replace(id: string, ...entries: (Requirement | IRequirement)[]): void;
  /** Drops the entry registered as `id` and the rules made from it. Throws for an id nothing is registered as. */
  remove(id: string): void;
  /** As `remove`, for those of `entries` it holds: like any registry, it ignores the others. */
  unregister(...entries: Requirement[]): void;
  /** The rules made from the entry registered as `id`: none for one that only describes. */
  rulesFor(id: string): Rule[];
  /** The rule registry the entries' rules go into: a game's own. */
  ruleRegistry(): RuleRegistry;
  private commit;
  private drop;
  private prepare;
  private require;
}
export declare const instance: RequirementRegistry;
export default RequirementRegistry;
