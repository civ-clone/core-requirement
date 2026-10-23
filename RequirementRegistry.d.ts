import { Relation, Requirement, Target } from './Requirement';
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
 * another. `rules.replace` on a derived rule still works, as the way out for behaviour the graph can't say.
 */
export declare class RequirementRegistry extends EntityRegistry<Requirement> {
  private _byId;
  private _derived;
  private _derivers;
  private _rules;
  constructor(rules?: RuleRegistry);
  /**
   * Holds `entries` and registers the rules `derive` makes from each, in order. `derive` is `null` for an entry whose
   * rule is written by hand (a state condition), which the entry only describes.
   */
  add(derive: Deriver | null, ...entries: Requirement[]): void;
  /** As `add`, with no rules made: the entries only describe. */
  register(...entries: Requirement[]): void;
  /** The entry registered as `id`, or `null`. */
  getById(id: string): Requirement | null;
  /** The entries about `Subject`, or a class it extends, optionally only those of one relation. */
  for(Subject: IConstructor, relation?: Relation): Requirement[];
  /** The entries that name `target`: what an advance leads to, what a Wonder makes obsolete. */
  leadsTo(target: Target, relation?: Relation): Requirement[];
  /**
   * Swaps the entry registered as `id` for `entries`, and its rules for the ones the same deriver makes from them. The
   * replacements needn't keep the id. Throws for an id nothing is registered as, as a mistyped plugin should.
   */
  replace(id: string, ...entries: Requirement[]): void;
  /** Drops the entry registered as `id` and the rules made from it. Throws for an id nothing is registered as. */
  remove(id: string): void;
  /** As `remove`, for each of `entries`. */
  unregister(...entries: Requirement[]): void;
  /** The rules made from the entry registered as `id`: none for one that only describes. */
  rulesFor(id: string): Rule[];
  private derive;
  private drop;
  private refuseDuplicates;
  private require;
}
export declare const instance: RequirementRegistry;
export default RequirementRegistry;
